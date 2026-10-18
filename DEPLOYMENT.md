# Nommable Deployment Guide

**This is the authoritative guide for installing, upgrading, backing up, and recovering Nommable.** The README links here instead of duplicating these steps.

## Architecture (what you are deploying)

Single container, single volume, single port. The backend serves the API
and the frontend SPA. The database is SQLite (`better-sqlite3`), and
authentication is Better Auth (username login, admin roles, Bearer session
tokens). There is no separate database service, no PostgreSQL, and no
separate frontend/backend containers.

What lives where (inside the container / on the volume):

| Path | Contents |
|---|---|
| `/data/nommable.db` | SQLite database (WAL mode) — all app data |
| `/data/uploads` | Uploaded images and files |
| `/data/backups` | Automatic safety backups written before a restore |
| `/data/backup-meta.json` | Last backup / last restore timestamps shown in the System tab |

## Installing

### Option A: Docker Compose (local server / VPS)

```bash
git clone https://github.com/mortegaux/nommable.git
cd nommable
cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET and ENCRYPTION_KEY (see below)
docker compose up -d
```

- App: http://localhost:8992 (API at `/api`, first-run onboarding wizard at `/setup`)
- Secrets are never committed — `docker-compose.yml` reads them from a
  gitignored `.env` file (or from Portainer stack environment variables).

On first run, open the app and complete the onboarding wizard to create the
admin account.

### Option B: Portainer (recommended for home servers)

1. **Stacks** → **Add stack**, name it `nommable`
2. Build method: **Repository**
   - Repository URL: `https://github.com/mortegaux/nommable`
   - Repository reference: `main`
   - Compose path: `docker-compose.yml`
3. In **Environment variables**, set at minimum:
   - `BETTER_AUTH_SECRET` — long random string (32+ chars)
   - `ENCRYPTION_KEY` — exactly 64 hex chars
   - `CORS_ORIGIN` — your public URL (e.g. `https://nommable.example.com`)
   - `ADMIN_PASSWORD` — only needed if you also set `SEED_ADMIN_ON_BOOT=true` (see below); otherwise the admin account is created in the onboarding wizard
4. **Deploy the stack**
5. Open the app and complete the onboarding wizard to create the admin account.

> **Redeploy twice and verify.** Portainer may use a cached build on the
> first redeploy after a push — run the redeploy a second time, then check
> the app shows the new behavior.

### Option C: Railway

1. New Project → **Deploy from GitHub repo**, select `mortegaux/nommable`
2. Add Variables: `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `CORS_ORIGIN`
3. Settings → Volumes → Add Volume, mounted at `/data`
4. Deploy. Railway auto-deploys on push; force a redeploy from the Deployments view if needed.

### Option D: Render

1. New → **Blueprint**, connect the repo, Deploy Blueprint. The Blueprint provisions a 5 GB persistent disk at `/data` and generates `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` from `render.yaml`.
2. To redeploy manually: Deploys → Manual Deploy → Deploy latest commit.

### Option E: Local development (not for production use)

```bash
git clone https://github.com/mortegaux/nommable.git
cd nommable
npm install
cp packages/backend/.env.example packages/backend/.env
# Edit packages/backend/.env (BETTER_AUTH_SECRET, ENCRYPTION_KEY)
npm run dev:backend   # backend on http://localhost:3001
npm run dev:frontend  # in a second terminal — frontend on http://localhost:5173
```

The SQLite database file is created automatically on first run (at `DB_PATH`
if set, else `/data/nommable.db` when `/data` exists, else `./nommable.db`
in the working directory). Open the app and complete the onboarding wizard
at `/setup` to create the admin account.

## Required Environment Variables

| Variable | Purpose | Generate |
|---|---|---|
| `BETTER_AUTH_SECRET` | Session signing secret (min 32 chars). `JWT_SECRET` is accepted as a legacy alias if `BETTER_AUTH_SECRET` is unset. | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Encrypts stored AI keys / SMTP passwords (exactly 64 hex chars) | `openssl rand -hex 32` |

Optional but recommended:

| Variable | Default | Purpose |
|---|---|---|
| `HOST_PORT` | `8992` | Host port the app listens on (Compose only) |
| `ADMIN_USERNAME` | `admin` | Only used with `SEED_ADMIN_ON_BOOT=true` (below) |
| `ADMIN_PASSWORD` | _(empty)_ | Only used with `SEED_ADMIN_ON_BOOT=true` (below) |
| `SEED_ADMIN_ON_BOOT` | _(unset)_ | Set to `true` to seed the admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD` on boot. When unset (the default), the admin account is created through the first-run onboarding wizard, and `ADMIN_USERNAME` / `ADMIN_PASSWORD` are ignored. |
| `CORS_ORIGIN` | `http://localhost:8992` | Allowed origin for the frontend — set to your public URL in production |
| `DB_PATH` | `/data/nommable.db` in Docker, `./nommable.db` locally | SQLite database file path |
| `SMTP_*` | _(unset)_ | Email for invitations (also configurable in Admin Settings) |

See `.env.example` (Docker/Compose) and `packages/backend/.env.example`
(local development) for the full lists.

## Upgrading

1. **Take a backup first** (below) — always, before every upgrade.
2. Check the **Settings → System** tab: it shows the installed vs. available
   version and release notes.
3. Apply the new version:
   - **Portainer:** open the stack → **Update the stack** → enable
     **Re-pull image and redeploy** → **Update**. Repeat the update once
     more (see the cached-build note above).
   - **Local Compose:** `git pull && docker compose up -d --build`
   - **Railway:** auto-deploys on push, or redeploy from the Deployments view.
   - **Render:** Deploys → Manual Deploy → Deploy latest commit.
4. Verify: open the app, confirm the System tab shows the new version and
   "migrations up to date".

Releases are versioned (`vX.Y.Z`) and published as multi-architecture Docker
images; the System tab reports when a new release is available. Updates are
applied manually through your deployment — the app never modifies itself.

## Backup and Restore

Use the built-in feature. It is the only supported way to back up a running
instance.

**Back up:** **Settings → Data Management → Backup & Restore → Download
backup.** The download is a single `.zip` containing:

- `manifest.json` — format version, app version, created-at time, entity counts, schema version
- `database.db` — a consistent snapshot taken with better-sqlite3's `.backup()` (never a raw copy of the live file)
- `uploads/` — the full uploads tree

**Restore:** **Settings → Data Management → Backup & Restore → Choose backup
file → Upload & preview**, then confirm. The preview validates the backup
before anything is touched (manifest version/shape, schema compatibility,
manifest counts vs. the backup database, zip-slip defenses). On confirm the
server writes a safety backup of the current data to
`/data/backups/safety-<timestamp>.zip`, swaps in the restored database +
uploads, and restarts. The System tab shows the last backup and last restore
times.

Notes:

- Backups are admin-only. Restore uploads are capped at 1 GiB.
- A backup from a **newer** app version is rejected — restore only into the
  same or a newer app version than the backup came from.
- Keep backup `.zip` files somewhere safe, outside the container. They
  contain your full database, including encrypted AI provider keys.

**Manual fallback (container stopped only):** if the app cannot run at all,
stop the container first, then copy `/data/nommable.db` and `/data/uploads`
out of the volume. Never raw-copy the live database file while the app is
running — WAL mode makes a live copy potentially inconsistent; the in-app
backup takes a consistent snapshot instead.

## Recovery

**If an upgrade fails / the app won't start:**

1. Read the container logs. A missing-secret error (`BETTER_AUTH_SECRET`,
   `ENCRYPTION_KEY`) is the most common cause — see the table above.
2. **Do NOT delete the database file.** Deleting `/data/nommable.db`
   destroys all data; it is never a recovery step.
3. If startup reports a migration error, or reports that the database is
   newer than this build (e.g. you rolled the image back without restoring
   the database): restore a backup taken on the matching app version via
   **Settings → Data Management**, or stop the container and put a known-good
   `nommable.db` + `uploads/` back into `/data` from your manual backup.
4. If the database file itself is corrupt, restore from a backup — there is
   no repair path for a corrupt SQLite file.

**Rollback:** rolling back means restoring the previous app version **and**
a database backup from that version. Rolling the image back alone, without
restoring the database, is not supported — the database may contain
migrations the older build does not know about, and startup will refuse
rather than run mismatched code.

## Troubleshooting

**Build fails in Portainer but works locally**
- Portainer needs enough RAM for the build (~2GB+). If the host is small,
  build locally and push a pre-built image instead.
- Delete any partial `nommable` images in Portainer, then redeploy twice.

**App won't start / exits immediately**
- Check the container logs for a missing-secret error. The backend refuses
  to boot in production without `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY`.
- Confirm `BETTER_AUTH_SECRET` is at least 32 chars and `ENCRYPTION_KEY`
  is exactly 64 hex chars.

**First-run wizard never appears / login fails**
- The onboarding wizard runs only when no admin exists yet. If the
  database already has an admin, log in with that account.
- If you need a fresh start, stop the container, delete
  `/data/nommable.db` (you lose all data), and restart.

**Restore fails / backup rejected**
- Check that the backup is not from a newer app version than the one
  running (see Backup and Restore above), and that the file is a
  complete `.zip` from a Nommable backup download.

**Port already in use**
- Change `HOST_PORT` in the stack environment variables (e.g. `8993`).

## Production Checklist

- [ ] Strong `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` set (no defaults)
- [ ] `CORS_ORIGIN` set to the real public URL
- [ ] HTTPS via reverse proxy (Traefik, Nginx Proxy Manager, etc.)
- [ ] Backup taken (Settings → Data Management) and stored outside the container
- [ ] Backup taken before every upgrade
- [ ] If you seeded the admin via `SEED_ADMIN_ON_BOOT`, `ADMIN_PASSWORD` changed after first login
- [ ] Portainer access control enabled
