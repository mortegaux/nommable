# Upgrading — supported baselines, rollback, and recovery (issue #17)

> Link this page from `docs/releases.md` ("If a release fails" section):
> it is the operator-facing companion to the release process. It is a
> standalone file because the branch that added it was cut from a base
> that does not contain `docs/releases.md`.

## Supported upgrade baselines

Nommable supports upgrading from the **two prior versions**. For the
current release:

| Upgrading from | Status |
| --- | --- |
| v1.1.0 | Supported — first tagged release |
| v1.0.0 | Supported — initial package version (never tagged as a release) |

Both baselines shipped the same single migration (`InitialSchema`,
added 2026-10-13, never edited since), so their database schemas are
identical today. They are kept as separate baselines so the upgrade
tests already cover two versions when a real schema migration lands.

Skipping more than two versions is untested: upgrade stepwise
(v1.0.0 → v1.1.0 → v1.2.0) instead of jumping straight to the
newest release.

## Before upgrading

1. **Take a backup.** Settings → Data Management → Download backup.
   Keep the `.zip` somewhere safe — it contains the database plus
   uploads, and it is the only supported way back.
2. Deploy the new image (Portainer: redeploy twice and verify).

## How upgrades run

On startup the app applies any pending TypeORM migrations before it
serves traffic (`migrationsRun: true`, `synchronize: false` — the
schema is owned by migrations, never auto-synced).

- All pending migrations run in a **single transaction** (TypeORM's
  default `migrationsTransactionMode: 'all'`). If any migration
  fails, the whole batch rolls back: the database stays in its
  pre-upgrade state. It is never half-migrated.
- If the database records migrations this build does not know about
  (the image was rolled back without restoring the database), startup
  refuses with a clear "schema is NEWER than this build" error
  instead of silently running mismatched code.
- The app **never runs down-migrations**. There is no automatic
  schema downgrade path.

## If an upgrade fails

How you will know:

- The container exits (or restart-loops) during startup; the app
  never serves traffic on a failed migration.
- The startup log shows one of the fail-fast errors from
  `packages/backend/src/db/startup.ts`:
  - `Database migrations failed: …` — a migration threw. The database
    was rolled back to its pre-upgrade state.
  - `Database file appears corrupt or is not a SQLite database.`
  - `Database schema is NEWER than this build: …` — the image was
    rolled back without restoring the database (see below).

What to do:

1. **Do NOT delete the database file.** Deleting it destroys the data
   the backup would have restored. The database is intact (migrations
   rolled back) or recoverable from backup.
2. If the app still starts on the old image, restore via the UI:
   Settings → Data Management → Upload & preview → Confirm. This
   writes a safety backup first, then restores.
3. If the app will not start at all, restore manually:
   - Stop the container.
   - From the backup `.zip`, extract `database.db` and replace
     `<dataDir>/nommable.db` (default data dir `/data`), and extract
     `uploads/` over `<dataDir>/uploads/`.
   - Start the container on the **previous** image tag.
4. Report the startup error (container log) — a migration failure is
   a bug, and the log line names the failing migration.

## Rolling back

Rolling back means **two** things, both required if the upgrade ran
a migration:

1. Redeploy the previous image tag (e.g.
   `ghcr.io/mortegaux/nommable:v1.1.0`). `latest` only ever moves
   forward on a successful release; re-point it manually only if a
   bad release already moved it (see `docs/releases.md`).
2. Restore the pre-upgrade backup (steps above). Redeploying the old
   image alone is NOT enough once a migration has applied: the old
   build will refuse to start against the newer schema (downgrade
   guard), which is the safe behavior — it is telling you the
   database still needs restoring.

If the upgrade ran **no** migration (schema unchanged), redeploying
the old image alone is sufficient.

## How upgrades are tested

- `packages/backend/src/__tests__/db-upgrade/fixtures.ts` builds
  fixture databases for each supported baseline (that version's
  migrations + representative seeded rows). Fixtures are built
  deterministically in the test — no binary blobs are checked in.
- `packages/backend/src/__tests__/db-upgrade/db-upgrade.test.ts`
  runs the current migrations against each fixture and verifies
  migrations apply, row counts and spot-checked values survive, the
  schema matches, re-running is a no-op, and a failing migration
  rolls back the whole batch.
- `packages/backend/src/__tests__/db-upgrade/startup.test.ts`
  covers the startup failure paths (fresh, corrupt, newer-schema,
  unreachable database).
- CI runs these in the dedicated `upgrade-tests` job (see
  `.github/workflows/ci.yml`), so every release candidate upgrades
  the prior two supported versions.

## Maintainer rules

- **Never edit a shipped migration.** Always add a new one. If a
  shipped migration ever has to be corrected, copy the old version
  into the fixture builder's per-version lists first, or the "old"
  fixtures will silently become new-schema fixtures and the upgrade
  tests will prove nothing.
- When adding a migration, extend the fixture builder's older
  baseline to stop at the previous migration, and add the new
  table(s) to `EXPECTED_TABLES` and to `scripts/ci/verify-migrations.mjs`.
