#!/usr/bin/env bash
# Build & push backend + frontend Docker images to AWS ECR in parallel.
#
# Required env:
#   AWS_ACCESS_KEY_ID
#   AWS_SECRET_ACCESS_KEY
#   AWS_REGION
#   AWS_ACCOUNT_ID
#   BACKEND_REPO              (ECR repo name for the backend image)
#   FRONTEND_REPO             (ECR repo name for the frontend image)
#
# Optional env:
#   AWS_SESSION_TOKEN         (only if using temporary creds)
#   IMAGE_TAG                 (default: latest)
#   ECR_HOST                  (default: ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com)
#
# Optional frontend build args (passed through if set):
#   ENCRYPTION_KEY, CSRF_SECRET,
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE,
#   STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET,
#   STRIPE_PRICE_STARTER, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_ENTERPRISE
#
# Loads variables from infra/docker/.env (if present) before validating.

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"
  set +a
fi

require_env() {
  local missing=()
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then
      missing+=("$v")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    printf '\033[1;31m[env]\033[0m missing required: %s\n' "${missing[*]}" >&2
    printf '   set them in your shell or in %s/.env\n' "$SCRIPT_DIR" >&2
    exit 64
  fi
}

require_env AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION \
            AWS_ACCOUNT_ID BACKEND_REPO FRONTEND_REPO

IMAGE_TAG="${IMAGE_TAG:-latest}"
ECR_HOST="${ECR_HOST:-${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com}"

cd "$REPO_ROOT"

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$1" "$2"; }
fail() { printf '\033[1;31m[%s]\033[0m %s\n' "$1" "$2" >&2; }

require() { command -v "$1" >/dev/null 2>&1 || { fail "deps" "missing $1"; exit 127; }; }
require aws
require docker
require npm

if [[ "${SKIP_TESTS:-}" == "1" ]]; then
  log "test" "SKIP_TESTS=1 — skipping npm run test:all"
else
  log "test" "running npm run test:all (must pass before build/push)"
  if ! npm run test:all; then
    fail "test" "npm run test:all failed — aborting before build/push"
    exit 1
  fi
  log "test" "all tests passed"
fi

log "ecr" "logging in to ${ECR_HOST}"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_HOST" >/dev/null
log "ecr" "logged in"

FE_BUILD_ARGS=()
for v in ENCRYPTION_KEY CSRF_SECRET \
         NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE \
         STRIPE_API_KEY STRIPE_WEBHOOK_SECRET \
         STRIPE_PRICE_STARTER STRIPE_PRICE_PROFESSIONAL STRIPE_PRICE_ENTERPRISE; do
  if [[ -n "${!v:-}" ]]; then
    FE_BUILD_ARGS+=(--build-arg "$v=${!v}")
  fi
done

build_backend() {
  docker build \
    -t "${BACKEND_REPO}:${IMAGE_TAG}" \
    -t "${ECR_HOST}/${BACKEND_REPO}:${IMAGE_TAG}" \
    -f backend/Dockerfile backend
}

build_frontend() {
  docker build \
    ${FE_BUILD_ARGS[@]+"${FE_BUILD_ARGS[@]}"} \
    -t "${FRONTEND_REPO}:${IMAGE_TAG}" \
    -t "${ECR_HOST}/${FRONTEND_REPO}:${IMAGE_TAG}" \
    -f Dockerfile .
}

log "build" "backend  → ${BACKEND_REPO}:${IMAGE_TAG}  (log: ${LOG_DIR}/backend.log)"
log "build" "frontend → ${FRONTEND_REPO}:${IMAGE_TAG} (log: ${LOG_DIR}/frontend.log)"

build_backend  > "${LOG_DIR}/backend.log"  2>&1 &
BE_PID=$!
build_frontend > "${LOG_DIR}/frontend.log" 2>&1 &
FE_PID=$!

# Live progress: print last line of each log every 5s
(
  while kill -0 "$BE_PID" 2>/dev/null || kill -0 "$FE_PID" 2>/dev/null; do
    be_state=$(kill -0 "$BE_PID" 2>/dev/null && echo running || echo done)
    fe_state=$(kill -0 "$FE_PID" 2>/dev/null && echo running || echo done)
    be_tail=$(tail -n 1 "${LOG_DIR}/backend.log"  2>/dev/null | cut -c1-90)
    fe_tail=$(tail -n 1 "${LOG_DIR}/frontend.log" 2>/dev/null | cut -c1-90)
    printf '\r\033[K[backend  %-7s] %s\n' "$be_state" "$be_tail"
    printf  '[frontend %-7s] %s\n' "$fe_state" "$fe_tail"
    sleep 5
  done
) &
TICK_PID=$!

BE_RC=0; FE_RC=0
wait "$BE_PID" || BE_RC=$?
wait "$FE_PID" || FE_RC=$?
kill "$TICK_PID" 2>/dev/null || true
wait "$TICK_PID" 2>/dev/null || true

if [[ $BE_RC -ne 0 ]]; then
  fail "backend"  "build failed (rc=$BE_RC) — log:"
  tail -n 60 "${LOG_DIR}/backend.log" >&2
fi
if [[ $FE_RC -ne 0 ]]; then
  fail "frontend" "build failed (rc=$FE_RC) — log:"
  tail -n 60 "${LOG_DIR}/frontend.log" >&2
fi
[[ $BE_RC -ne 0 || $FE_RC -ne 0 ]] && exit 1

log "build" "both images built"

log "push" "pushing in parallel"
docker push "${ECR_HOST}/${BACKEND_REPO}:${IMAGE_TAG}"  > "${LOG_DIR}/push-backend.log"  2>&1 &
BE_PID=$!
docker push "${ECR_HOST}/${FRONTEND_REPO}:${IMAGE_TAG}" > "${LOG_DIR}/push-frontend.log" 2>&1 &
FE_PID=$!

BE_RC=0; FE_RC=0
wait "$BE_PID" || BE_RC=$?
wait "$FE_PID" || FE_RC=$?

if [[ $BE_RC -ne 0 ]]; then
  fail "backend"  "push failed (rc=$BE_RC) — log:"
  tail -n 60 "${LOG_DIR}/push-backend.log" >&2
fi
if [[ $FE_RC -ne 0 ]]; then
  fail "frontend" "push failed (rc=$FE_RC) — log:"
  tail -n 60 "${LOG_DIR}/push-frontend.log" >&2
fi
[[ $BE_RC -ne 0 || $FE_RC -ne 0 ]] && exit 1

log "done" "${ECR_HOST}/${BACKEND_REPO}:${IMAGE_TAG}"
log "done" "${ECR_HOST}/${FRONTEND_REPO}:${IMAGE_TAG}"
