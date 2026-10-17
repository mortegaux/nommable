#!/usr/bin/env bash
# smoke-test.sh — container smoke gate.
#
# Builds nothing: give it an already-built image (CI builds it first).
# Starts the container with throwaway dummy secrets, waits for /health,
# asserts the app root serves the SPA, then stops the container.
#
# Usage:
#   ./scripts/ci/smoke-test.sh [image] [port] [timeout-seconds]
#   ./scripts/ci/smoke-test.sh nommable:ci 3001 60
#
# Exit code 0 = the built container reaches /health and serves the app.
# On failure the container logs are printed before cleanup.
set -euo pipefail

IMAGE="${1:-nommable:ci}"
PORT="${2:-3001}"
TIMEOUT_SECONDS="${3:-60}"
CONTAINER_NAME="nommable-ci-smoke-$$"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Dummy secrets: the container is thrown away after this script exits.
# These values are generated fresh per run and are never real credentials.
BETTER_AUTH_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"

echo "[smoke] starting $IMAGE on port $PORT (container $CONTAINER_NAME)"
docker run -d --rm --name "$CONTAINER_NAME" \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e HOST=0.0.0.0 \
  -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  -e CORS_ORIGIN="http://localhost:$PORT" \
  -e DB_PATH=/data/nommable.db \
  -p "$PORT:3001" \
  "$IMAGE" >/dev/null

fail_with_logs() {
  echo "[smoke] FAIL: $1"
  echo "[smoke] container logs:"
  docker logs "$CONTAINER_NAME" 2>&1 | tail -n 100 || true
  exit 1
}

echo "[smoke] waiting up to ${TIMEOUT_SECONDS}s for /health ..."
deadline=$((SECONDS + TIMEOUT_SECONDS))
while true; do
  if curl -fsS "http://localhost:$PORT/health" -o /tmp/nommable-smoke-health.json 2>/dev/null; then
    break
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    fail_with_logs "/health never became ready within ${TIMEOUT_SECONDS}s"
  fi
  sleep 2
done

HEALTH_BODY="$(cat /tmp/nommable-smoke-health.json)"
if ! echo "$HEALTH_BODY" | grep -q '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  fail_with_logs "/health returned unexpected body: $HEALTH_BODY"
fi
echo "[smoke] /health OK: $HEALTH_BODY"

echo "[smoke] checking app root / serves the SPA ..."
HTTP_CODE="$(curl -sS -o /tmp/nommable-smoke-root.html -w '%{http_code}' "http://localhost:$PORT/")"
CONTENT_TYPE="$(curl -sS -I "http://localhost:$PORT/" | grep -i '^content-type:' || true)"
if [ "$HTTP_CODE" != "200" ]; then
  fail_with_logs "GET / returned HTTP $HTTP_CODE, expected 200"
fi
if ! echo "$CONTENT_TYPE" | grep -qi 'text/html'; then
  fail_with_logs "GET / returned Content-Type '$CONTENT_TYPE', expected text/html"
fi
if ! grep -qi '<html' /tmp/nommable-smoke-root.html; then
  fail_with_logs "GET / body does not look like the SPA HTML shell"
fi
echo "[smoke] GET / OK: HTTP 200, text/html, SPA shell"

echo "[smoke] PASS: container $IMAGE reaches /health and serves the app"
