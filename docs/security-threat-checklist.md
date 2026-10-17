# Nommable Security Threat Checklist — Imports, Uploads, Auth, Admin

Written for issue #18. This is the authoritative checklist for the app's
highest-risk surfaces. Each item states the threat, the control, and where it
is enforced. "Verified" means covered by an automated test named in
parentheses; "Reviewed" means verified by code inspection during the #18
audit (2026-10-17).

## 1. Recipe import (SSRF)

Recipe import fetches arbitrary URLs server-side. The attacker model is an
authenticated user probing the server's network.

| Threat                                                                              | Control                                                                                                                                                                          | Where                                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Fetch internal / loopback / link-local / cloud-metadata address                     | Public-IP-only validation: every DNS-resolved address must be globally routable (ipaddr.js); anything else blocked                                                               | `utils/ssrf-guard.ts` → `assertSafeScrapeUrl` (Verified: `ssrf-guard.test.ts`)       |
| IPv4-mapped IPv6 (`::ffff:127.0.0.1`), 6to4, Teredo, NAT64, discard prefix bypasses | ipaddr.js range checks + explicit blocks for benchmarking / NAT64 / discard ranges                                                                                               | `utils/ssrf-guard.ts` (Verified: `ssrf-guard.test.ts`)                               |
| Redirect to an internal address (public URL 302 → metadata endpoint)                | Redirects followed manually with per-hop re-validation; plain axios `maxRedirects` is never used for user-influenced URLs                                                        | `utils/ssrf-guard.ts` → `fetchWithGuardedRedirects` (Verified: `ssrf-guard.test.ts`) |
| Python scraper follows redirects with its own client                                | Redirect chain resolved (validated) in TS first; Python receives the final URL                                                                                                   | `services/scraper/scraper.service.ts` (Verified: `ssrf-guard.test.ts`)               |
| Non-HTTP(S) scheme (`file://`, `ftp://`, `gopher://`)                               | Scheme allowlist http/https only                                                                                                                                                 | `assertSafeScrapeUrl` (Verified)                                                     |
| Embedded credentials in URL                                                         | Rejected                                                                                                                                                                         | `assertSafeScrapeUrl` (Verified)                                                     |
| SSRF probing at scale                                                               | Import-specific rate limit: 20/min per user (on top of the 100/min/IP global API cap)                                                                                            | `api/routes/recipe.routes.ts` (Verified: `security.routes.test.ts`)                  |
| Oversized response exhausting memory                                                | 10 MB `maxContentLength` on all scraper fetches; 10 s / 15 s timeouts; 30 s Python subprocess timeout                                                                            | `utils/ssrf-guard.ts`, `scraper.service.ts` (Reviewed)                               |
| DNS rebinding / TOCTOU between validation and fetch                                 | **Accepted residual risk.** Closing it needs DNS-pinned connections, which axios does not support out of the box. The window is small and the attacker is an authenticated user. | —                                                                                    |
| Python fetch has no size cap                                                        | **Accepted residual risk.** Bounded by the 30 s subprocess timeout; the TS redirect-resolution pass already downloads the page with a 10 MB cap in most flows.                   | —                                                                                    |

## 2. Image uploads & image serving

| Threat                                                               | Control                                                                                                                                                                           | Where                                                                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| SVG upload → stored XSS (SVG served from app origin executes script) | Strict MIME allowlist excludes `image/svg+xml` at the multer filter; magic-byte content check rejects SVG/HTML/script content even when disguised as `.jpg`                       | `utils/image-validation.ts`, `api/middleware/upload.ts` (Verified: `image-validation.test.ts`, `security.routes.test.ts`) |
| Spoofed MIME type (script renamed `.jpg`)                            | Magic-byte detection governs; client MIME is never trusted                                                                                                                        | Same (Verified)                                                                                                           |
| Malicious filename / path traversal                                  | Filenames are server-generated (`recipe-<ts>-<rand>.<ext>`); extensions come from the validated-MIME map, never the client name; subdir/filename params pass through `basename()` | `upload.ts`, `image-storage.service.ts` (Reviewed)                                                                        |
| Oversized upload (disk / memory exhaustion)                          | 5 MB cap on recipe/profile uploads; 50 MB per file, max 5 files, on extraction uploads                                                                                            | `upload.ts` (Verified: `security.routes.test.ts`)                                                                         |
| Extraction memory spike (50 MB × 5 files in memory storage)          | **Accepted residual risk.** Extraction is authenticated-only; operators should set container memory limits. A streaming pipeline would be needed to remove it fully.              | —                                                                                                                         |
| Server-side image download (recipe import `imageUrl`)                | Same SSRF guard + redirect validation as imports; response must be allowlisted content-type AND detected allowlisted bytes; SVG rejected; failures fall back to the remote URL    | `image-storage.service.ts` → `localizeExternalImage` (Verified: `image-storage.test.ts`)                                  |
| Stored MIME type says SVG (legacy rows / caller-supplied MIME)       | Stored MIME always comes from magic-byte detection; the uploads fallback route serves only allowlisted MIMEs and defaults anything else to `image/jpeg`                           | `image-storage.service.ts`, `app.ts` (Verified: `image-storage.test.ts`)                                                  |
| Polyglot file (JPEG magic + appended script)                         | Served as `image/jpeg` with `X-Content-Type-Options: nosniff` (helmet); browsers render it as an image, never execute it                                                          | `app.ts` (Reviewed)                                                                                                       |
| Uploaded files publicly reachable                                    | **Accepted by design.** `/uploads` is unauthenticated static serving; upload URLs must not be treated as private. Do not store sensitive images via uploads.                      | `app.ts` (Reviewed)                                                                                                       |

## 3. Links & rendered content

| Threat                                                                 | Control                                                                                                                                                 | Where                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Stored `javascript:` `sourceUrl` → clickable XSS on recipe detail page | API rejects non-http(s) `sourceUrl` on recipe create/update; the detail page only renders an anchor for http(s) URLs (legacy rows render as plain text) | `services/recipe/recipe.service.ts`, `features/recipes/RecipeDetailPage.tsx` (Verified: `security.routes.test.ts`) |
| Tabnabbing from external links                                         | `rel="noopener noreferrer"` on external anchors                                                                                                         | `RecipeDetailPage.tsx` (Reviewed)                                                                                  |

## 4. Auth & sessions

| Threat                                              | Control                                                                                                                              | Where                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Hand-rolled auth / session / crypto                 | None exists. All auth goes through Better Auth (vetted): scrypt passwords, session creation/validation/rotation/expiry, admin plugin | `lib/auth.ts` (Reviewed)                                                              |
| Session lifetime too long / bans not taking effect  | 7-day absolute expiry, 1-day sliding refresh, `cookieCache: false` (every request hits the DB, so bans apply immediately)            | `lib/auth.ts` (Reviewed)                                                              |
| Login brute force                                   | 10/min limiter on all `/api/auth/*` routes + Better Auth's own 200/min limiter                                                       | `api/routes/auth.routes.ts`, `lib/auth.ts` (Reviewed)                                 |
| Session cookie not set (login returned Bearer only) | Fixed in #42: sign-in calls pass `returnHeaders: true` and forward `Set-Cookie`; logout forwards the expiring cookie                 | `api/controllers/auth.controller.ts` (Verified: `session-cookie-auth.routes.test.ts`) |
| Role escalation                                     | Roles come from the app DB row, never the token; `requireAdmin`/`requireRole` check `req.userRole`                                   | `api/middleware/auth.ts`, `api/middleware/role.ts` (Reviewed)                         |
| Admin endpoints exposed to non-admins               | Admin routes sit behind `authMiddleware + requireAdmin`                                                                              | `api/routes/user.routes.ts` and other admin routes (Reviewed)                         |

## 5. Secrets & config

| Threat                                     | Control                                                                                                                                                                                             | Where                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Default secrets in production              | Fail-closed boot guards: production refuses to start with the default `BETTER_AUTH_SECRET`, without an explicit `ENCRYPTION_KEY`, or with the default admin password when `SEED_ADMIN_ON_BOOT=true` | `config/index.ts` (Reviewed)                                                                                          |
| API keys / SMTP passwords at rest          | AES-256-GCM encrypted (`utils/crypto.ts`); plaintext legacy values still decrypt via `safeDecrypt`                                                                                                  | `api/controllers/ai.controller.ts`, `services/email/email.service.ts` (Reviewed; crypto round-trip: `crypto.test.ts`) |
| Secret values in logs                      | Never logged. SSRF/validation errors log only hostnames/URLs, never tokens or keys                                                                                                                  | Code inspection (Reviewed)                                                                                            |
| Dev defaults (`admin`/`admin`, dev secret) | Present only outside production; production guards above block them. Do not run production with `NODE_ENV` unset.                                                                                   | `config/index.ts` (Reviewed)                                                                                          |

## 6. Origin policy & transport

| Threat                                                              | Control                                                                                                                                                                                                       | Where                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Wildcard CORS + credentials (any site makes credentialed API calls) | Production refuses to boot with `CORS_ORIGIN=*`; default origin is `http://localhost:5173`                                                                                                                    | `config/index.ts` (Reviewed) |
| Missing security headers                                            | helmet: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, referrer policy, etc.                                                                                                                           | `app.ts` (Reviewed)          |
| CSP disabled                                                        | **Accepted, deliberate.** CSP is off to allow the inline theme script and external recipe images. The upload/SVG controls above are what keep this safe; do not re-enable CSP without testing theme + images. | `app.ts` (Reviewed)          |
| HSTS disabled                                                       | **Accepted, deliberate.** Plain-HTTP self-hosted LAN access is supported; operators behind HTTPS should terminate TLS at their reverse proxy.                                                                 | `app.ts` (Reviewed)          |
| Swagger docs public                                                 | **Accepted by design.** `/api/docs` exposes the API surface but no secrets.                                                                                                                                   | `app.ts` (Reviewed)          |
| Body-size DoS                                                       | `express.json()` / `urlencoded()` defaults (100 KB) apply to JSON bodies; multipart uploads are capped by multer (see §2)                                                                                     | `app.ts` (Reviewed)          |

## 7. How to re-verify

```bash
# Backend typecheck, lint, full backend suite, production build
npx tsc --noEmit -p packages/backend
npx eslint packages/backend/src/utils/ssrf-guard.ts packages/backend/src/utils/image-validation.ts \
  packages/backend/src/services/image-storage.service.ts \
  packages/backend/src/services/scraper/scraper.service.ts
npm run test -w packages/backend
npm run build -w packages/backend
```

Live checks (test env, authenticated session): import a recipe from a public
URL; import a URL that redirects to `http://127.0.0.1/` (must fail cleanly);
upload an SVG (must fail); upload an SVG renamed `.jpg` (must fail); hit
`/api/home-assistant/expiring` with the browser session (must return data,
per #42).
