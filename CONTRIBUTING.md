# Contributing to Nommable

## One-command check

From a clean clone, this single command proves the workspace builds, all
tests pass, and the database migrations produce the full schema:

```bash
npm ci && npm run build && npm test && node scripts/ci/verify-migrations.mjs
```

Prerequisites: Node.js 20+ and npm 9+.

To also prove the built container serves the app (needs Docker):

```bash
docker build -t nommable:ci . && ./scripts/ci/smoke-test.sh nommable:ci
```

The smoke test starts the container with throwaway dummy secrets, waits for
`GET /health` to return `{"status":"ok"}`, asserts `GET /` serves the SPA
(200 + HTML), then stops the container. It never touches your real database.

## Continuous integration

Every pull request and every push to `main` runs the CI workflow
(`.github/workflows/ci.yml`) with three jobs:

| Job | What it does |
| --- | --- |
| `build-and-test` | `npm ci`, builds all workspaces, backend tests (jest), frontend tests (vitest) |
| `migrations` | Applies migrations to a fresh throwaway SQLite DB and verifies all 26 schema tables + the migrations bookkeeping row exist |
| `container-smoke` | Builds the Docker image, boots it with dummy secrets, hits `/health` and `/` (runs only after the other two jobs pass) |

## Branch protection (one-time repo setup)

The workflow file alone cannot block merges — that is a repo setting a
maintainer must enable once, in **Settings → Branches → Branch protection
rules** for `main`:

1. Require a pull request before merging.
2. Require status checks to pass before merging, selecting all three CI jobs:
   `Build + unit tests`, `Migration check`, `Container smoke test`.
3. Require branches to be up to date before merging.

Until that rule exists, a red CI run is advisory only — do not merge a PR
while CI is red.

## Workflow for changes

1. Branch from `main` (never commit directly to `main`).
2. Run the one-command check above before opening a PR.
3. Open a PR; CI runs automatically. Keep the PR small and single-purpose.
4. Merge only when all three CI jobs are green.
