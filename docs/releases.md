# Releases — versioned Docker images + GitHub Releases (issue #15)

## Versioning

- **The git tag is the source of truth.** A release is `vX.Y.Z` (SemVer).
- The version also lives in all four `package.json` files
  (root, `packages/shared`, `packages/backend`, `packages/frontend`).
  They must all match the tag — the release workflow fails fast if any
  of them differs.
- The app itself does not read a version anywhere (no version in
  `/health` or the UI). In-app version display is issue #23, out of
  scope here.

## Cutting a release

1. Bump the version in all four `package.json` files to the new
   version (e.g. `1.1.0`), commit, open a PR, merge to `main`.
2. Tag the merge commit on `main` and push the tag:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
3. The release workflow (`.github/workflows/release.yml`) does the
   rest. No local builds, no manual GHCR pushes.

## What the release workflow does

1. **Version check + tests** — verifies all four `package.json`
   versions match the tag, then `npm ci`, builds all workspaces, and
   runs the backend (jest) and frontend (vitest) suites.
2. **Build + push** — builds the multi-arch image
   (`linux/amd64` + `linux/arm64`) with Buildx/QEMU and pushes it to
   GHCR with the immutable version tag only:
   `ghcr.io/mortegaux/nommable:v1.1.0`.
3. **Smoke-test the pushed image** — runs
   `scripts/ci/smoke-test.sh` against the just-pushed version-tagged
   image: boots it with throwaway dummy secrets, waits for `/health`
   → `{"status":"ok"}`, asserts `GET /` serves the SPA.
4. **Promote the stable channel** — only after the smoke test passes,
   `latest` is pointed at the same image digest
   (`docker buildx imagetools create`). A broken image never gets the
   `latest` tag.
5. **GitHub Release** — creates the Release on the tag with
   auto-generated changelog notes from merged PRs.

## Image tags

| Tag | Meaning |
| --- | --- |
| `ghcr.io/mortegaux/nommable:v1.1.0` | Immutable. This exact release, forever. Pin to this for reproducible deploys. |
| `ghcr.io/mortegaux/nommable:latest` | Stable channel. Always the latest release that passed tests + smoke test. Moves only on a successful release. |

## Deploying

Point Portainer (or any `docker run` / Compose file) at the image
instead of rebuilding from source:

```yaml
image: ghcr.io/mortegaux/nommable:latest   # or a pinned version, e.g. :v1.1.0
```

Pin a version tag for production stability; use `latest` when you
want to track the newest tested release. Redeploy twice and verify,
as always with Portainer (cached builds).

## GHCR package visibility (one-time, first release)

Packages pushed to GHCR start **private**. After the first release,
make the package public or nobody can pull it:
**github.com → your avatar → Your packages → nommable → Package
settings → Change visibility → Public.**

## Rollback

Deploy the previous version tag explicitly, e.g.
`ghcr.io/mortegaux/nommable:v1.0.0`. `latest` is only ever moved
forward by a successful release; to move it backward after a bad
release, a maintainer can re-point it manually:

```bash
docker buildx imagetools create -t ghcr.io/mortegaux/nommable:latest ghcr.io/mortegaux/nommable:v1.0.0
```

## If a release fails

- **Before the image push** (version check / tests): fix the cause,
  delete the tag, re-tag, push again.
- **After the image push** (smoke test): the version-tagged image is
  already on GHCR, but `latest` has NOT moved and no GitHub Release
  exists. Fix the cause, delete the tag, re-tag, push again — the
  re-run overwrites the version tag and re-runs the full pipeline.
- Deleting a tag:
  ```bash
  git tag -d v1.1.0
  git push origin :refs/tags/v1.1.0
  ```

## Architecture notes

- The `Dockerfile` has no arch-specific assumptions: the base image
  is `node:20-alpine` (official multi-arch), all `apk` packages exist
  for arm64, and the native modules (`better-sqlite3`, `canvas`)
  build from source if no prebuilt binary exists for the platform —
  both stages install the needed build tooling. The first arm64 build
  in CI is the real proof; worst case is a longer build, not a failure.
- Out of scope: in-app version display, update checks, and the admin
  version screen — that's issue #23.
