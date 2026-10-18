import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware';
import { z } from 'zod';
import { validateBody } from '../middleware';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// Brute-force protection applies ONLY to credential-bearing routes.
// GET /me is called on every page load by the SPA (checkAuth) and POST
// /logout carries a valid session — rate-limiting either one turns a
// transient 429 into a logout (issue #70). Do NOT re-add a blanket
// router.use(authLimiter) here.

const loginSchema = z.object({
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerWithInviteSchema = z.object({
  token: z.string().uuid(),
  username: z.string().min(3),
  password: z.string().min(6),
});

router.post('/register/invite', authLimiter, validateBody(registerWithInviteSchema), AuthController.registerWithInvitation);
router.post('/login', authLimiter, validateBody(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', authMiddleware, AuthController.me);

export default router;
