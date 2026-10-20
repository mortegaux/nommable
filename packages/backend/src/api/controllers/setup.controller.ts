import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../db/data-source';
import { User, AIConfig } from '../../db/entities';
import { UserRole } from '@nommable/shared';
import { auth, getAuthDb, ensureAppUser } from '../../lib/auth';
import { toAuthHeaders } from '../middleware/auth';
import { EmailService } from '../../services/email/email.service';
import { SystemSettingsService } from '../../services/settings/system-settings.service';
import { TaxonomyService } from '../../services/taxonomy/taxonomy.service';
import { AIService } from '../../services/ai/ai.service';
import { encrypt } from '../../utils/crypto';
import { AppError } from '../middleware/error-handler';

/**
 * Better Auth validation error codes that are safe to surface to the client:
 * they describe the user's own input (username/email/password shape), never
 * server internals. Anything else keeps the generic 500 treatment.
 */
const AUTH_VALIDATION_CODES = new Set([
  'INVALID_USERNAME',
  'USERNAME_TOO_SHORT',
  'USERNAME_TOO_LONG',
  'USERNAME_IS_ALREADY_TAKEN',
  'INVALID_DISPLAY_USERNAME',
  'INVALID_EMAIL',
  'INVALID_PASSWORD',
]);

/**
 * Convert a Better Auth APIError for invalid user input into an AppError
 * carrying its real status/message (e.g. 400 "Username is invalid"), instead
 * of letting the error handler collapse it into a generic 500. Returns null
 * for anything that is not a recognized auth validation error.
 *
 * Exported for unit testing — the route tests use a Better Auth mock whose
 * signUpEmail performs no username validation, so the conversion is
 * covered here with error objects shaped like the real APIError.
 */
export function toAuthValidationError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as { statusCode?: unknown; body?: unknown };
  const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined;
  const body = e.body as { message?: unknown; code?: unknown } | undefined;
  const message = typeof body?.message === 'string' ? body.message : undefined;
  const code = typeof body?.code === 'string' ? body.code : undefined;
  if (
    statusCode !== undefined &&
    statusCode >= 400 &&
    statusCode < 500 &&
    message &&
    code &&
    AUTH_VALIDATION_CODES.has(code)
  ) {
    return new AppError(statusCode, message);
  }
  return null;
}

export class SetupController {
  /**
   * GET /api/setup/status
   * Public endpoint that returns whether the instance still needs first-time setup
   * (true when no admin user exists yet).
   */
  static async getStatus(_req: Request, res: Response, next: NextFunction) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const adminCount = await userRepo.count({
        where: { role: UserRole.ADMIN },
      });

      res.json({ needsSetup: adminCount === 0 });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/setup/complete
   * Public only while no admin user exists. Once an admin exists, returns 403 Forbidden.
   */
  static async completeSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const adminCount = await userRepo.count({
        where: { role: UserRole.ADMIN },
      });

      if (adminCount > 0) {
        return res.status(403).json({
          error: 'Setup has already been completed',
        });
      }

      const { admin, smtp, library, ai } = req.body || {};

      // 1. Validate Admin Account credentials
      const username = typeof admin?.username === 'string' ? admin.username.trim() : '';
      const password = typeof admin?.password === 'string' ? admin.password : '';
      const rawEmail = typeof admin?.email === 'string' ? admin.email.trim() : '';

      if (!username || username.length < 3) {
        throw new AppError(400, 'Admin username must be at least 3 characters');
      }
      if (!password || password.length < 8) {
        throw new AppError(400, 'Admin password must be at least 8 characters');
      }

      const email = rawEmail || `${username}@system.local`;

      // 2. Create Admin via Better Auth + ensureAppUser()
      const authDb = getAuthDb();
      const existingAuthUser = authDb
        .prepare('SELECT id FROM "user" WHERE lower(username) = lower(?) OR lower(email) = lower(?)')
        .get(username, email) as { id: string } | undefined;

      if (existingAuthUser) {
        throw new AppError(409, 'Username or email already exists');
      }

      // Surface auth-layer validation errors (e.g. a username the auth
      // plugin rejects) with their real status/message instead of a
      // generic 500 from the error handler.
      let signUp;
      try {
        signUp = await auth.api.signUpEmail({
          body: {
            email,
            password,
            name: username,
            username,
          },
          headers: toAuthHeaders(req),
        });
      } catch (error) {
        const validationError = toAuthValidationError(error);
        if (validationError) throw validationError;
        throw error;
      }

      authDb
        .prepare('UPDATE "user" SET role = ? WHERE id = ?')
        .run(UserRole.ADMIN, signUp.user.id);

      const adminUser = await ensureAppUser(signUp.user.id, {
        email,
        username,
        role: UserRole.ADMIN,
      });
      adminUser.role = UserRole.ADMIN;
      adminUser.isSystemAdmin = true;
      await userRepo.save(adminUser);

      // Seed default categories/tags for the new admin
      const taxonomyService = new TaxonomyService();
      await taxonomyService.seedForUser(adminUser.id);

      // Sign in the new admin so the wizard can enter the dashboard immediately.
      // `returnHeaders: true` so Better Auth returns the Set-Cookie headers
      // for the signed session cookie (issue #41) — otherwise the cookie is
      // dropped and browser (cookie-only) requests have no session.
      const signIn = await auth.api.signInUsername({
        body: { username, password },
        headers: toAuthHeaders(req),
        returnHeaders: true,
      });
      const accessToken = signIn.response.token;
      const setupSetCookie = signIn.headers?.getSetCookie?.();

      // 3. Configure SMTP settings (if not skipped and host is provided)
      if (smtp && !smtp.skipped && typeof smtp.host === 'string' && smtp.host.trim()) {
        const smtpUser =
          typeof smtp.user === 'string' && smtp.user.trim()
            ? smtp.user.trim()
            : typeof smtp.username === 'string'
              ? smtp.username.trim()
              : '';
        await EmailService.saveSettings({
          host: smtp.host.trim(),
          port: Number(smtp.port) || 587,
          secure: Boolean(smtp.secure),
          user: smtpUser,
          pass: typeof smtp.pass === 'string' ? smtp.pass : undefined,
          fromEmail:
            typeof smtp.fromEmail === 'string' && smtp.fromEmail.trim()
              ? smtp.fromEmail.trim()
              : smtpUser || 'no-reply@nommable.local',
          fromName:
            typeof smtp.fromName === 'string' && smtp.fromName.trim()
              ? smtp.fromName.trim()
              : 'Nommable',
          enabled: smtp.enabled !== undefined ? Boolean(smtp.enabled) : true,
        });
      }

      // 4. Configure Library Mode & Shared Portions
      if (library) {
        const isPrivate = library.mode === 'private';
        await SystemSettingsService.updateSettings({
          sharedRecipes: isPrivate ? false : library.sharedRecipes ?? true,
          showRecipeAuthor: isPrivate ? false : library.showRecipeAuthor ?? true,
          sharedCollections: isPrivate ? false : library.sharedCollections ?? true,
          sharedMealPlans: isPrivate ? false : library.sharedMealPlans ?? true,
          sharedShoppingLists: isPrivate ? false : library.sharedShoppingLists ?? true,
          sharedPantry: isPrivate ? false : library.sharedPantry ?? true,
          sharedBatchCooking: isPrivate ? false : library.sharedBatchCooking ?? true,
        });
      }

      // 5. Configure AI based on selected mode ('managed', 'byok', or 'disabled')
      if (ai && ai.enabled) {
        const aiMode = ai.mode || (ai.geminiApiKey ? 'byok' : 'managed');
        const geminiKey = typeof ai.geminiApiKey === 'string' ? ai.geminiApiKey.trim() : '';
        const imageProvider = ai.imageProvider || 'google';
        const imageModel =
          imageProvider === 'google'
            ? (typeof ai.imageModel === 'string' && ai.imageModel.trim()) || 'gemini-2.0-flash'
            : undefined;
        const imageKey = typeof ai.imageApiKey === 'string' ? ai.imageApiKey.trim() : '';

        const aiConfigRepo = AppDataSource.getRepository(AIConfig);
        let globalConfig = await aiConfigRepo.findOne({ where: { isGlobal: true } });

        if (aiMode === 'byok' && geminiKey) {
          if (!globalConfig) {
            globalConfig = aiConfigRepo.create({
              userId: adminUser.id,
              isGlobal: true,
              aiMode: 'shared',
              provider: 'google',
              apiKey: encrypt(geminiKey),
              model: 'gemini-2.0-flash',
              imageModel,
              imageApiKey: imageKey ? encrypt(imageKey) : undefined,
              enabled: true,
            });
          } else {
            globalConfig.userId = adminUser.id;
            globalConfig.provider = 'google';
            globalConfig.apiKey = encrypt(geminiKey);
            globalConfig.model = 'gemini-2.0-flash';
            globalConfig.imageModel = imageModel;
            globalConfig.imageApiKey = imageKey ? encrypt(imageKey) : globalConfig.imageApiKey;
            globalConfig.enabled = true;
          }
          await aiConfigRepo.save(globalConfig);
        } else {
          // Managed AI mode: remove global DB config so AIService falls back to server env master keys
          if (globalConfig) {
            await aiConfigRepo.remove(globalConfig);
          }
        }
        AIService.clearCache();
      } else if (ai && !ai.enabled) {
        // AI disabled: remove any global config
        const aiConfigRepo = AppDataSource.getRepository(AIConfig);
        const globalConfig = await aiConfigRepo.findOne({ where: { isGlobal: true } });
        if (globalConfig) {
          await aiConfigRepo.remove(globalConfig);
        }
        AIService.clearCache();
      }

      // Forward the Set-Cookie headers (signed session cookie) with the
      // success response only — not on the error path.
      if (setupSetCookie?.length) {
        res.setHeader('set-cookie', setupSetCookie);
      }
      res.status(201).json({
        message: 'Setup completed successfully',
        user: {
          id: adminUser.id,
          email: adminUser.email,
          username: adminUser.username,
          role: adminUser.role,
          isSystemAdmin: true,
        },
        token: accessToken,
        accessToken,
      });
    } catch (error) {
      next(error);
    }
  }
}
