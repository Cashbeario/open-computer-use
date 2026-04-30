#!/usr/bin/env bash
# Build & push backend + frontend Docker images to AWS ECR, then deploy.
#
# Pipeline:
#   1. npm run test:all       (skip with SKIP_TESTS=1)
#   2. aws ecr login
#   3. docker compose build   (reads repo-root .env for build args)
#   4. docker tag for ECR
#   5. docker push (parallel)
#   6. terraform apply        (interactive -- you type "yes"; skip with SKIP_TERRAFORM=1)
#
# Required env (in infra/docker/.env or shell):
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
#   AWS_ACCOUNT_ID, BACKEND_REPO, FRONTEND_REPO
#
# Optional env:
#   AWS_SESSION_TOKEN, IMAGE_TAG (default: latest), ECR_HOST,
#   SKIP_TESTS=1, SKIP_TERRAFORM=1, COMPOSE_FILE (default: docker-compose.yml),
#   TF_DIR (default: infra/aws)

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; # shellcheck disable=SC1091
  source "$SCRIPT_DIR/.env"; set +a
fi

log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$1" "$2"; }
fail() { printf '\033[1;31m[%s]\033[0m %s\n' "$1" "$2" >&2; }

require_env() {
  local missing=()
  for v in "$@"; do
    [[ -z "${!v:-}" ]] && missing+=("$v")
  done
  if (( ${#missing[@]} > 0 )); then
    fail "env" "missing required: ${missing[*]}"
    printf '   set them in your shell or in %s/.env\n' "$SCRIPT_DIR" >&2
    exit 64
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { fail "deps" "missing $1"; exit 127; }
}

require_cmd aws
require_cmd docker
require_cmd npm

require_env AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION \
            AWS_ACCOUNT_ID BACKEND_REPO FRONTEND_REPO

IMAGE_TAG="${IMAGE_TAG:-latest}"
ECR_HOST="${ECR_HOST:-${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

cd "$REPO_ROOT"

# ---------- 1. tests ----------
if [[ "${SKIP_TESTS:-}" == "1" ]]; then
  log "test" "SKIP_TESTS=1 -- skipping npm run test:all"
else
  log "test" "running npm run test:all (must pass before build/push)"
  if ! npm run test:all; then
    fail "test" "npm run test:all failed -- aborting"
    exit 1
  fi
  log "test" "all tests passed"
fi

# ---------- 2. ECR login ----------
log "ecr" "logging in to $ECR_HOST"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_HOST" >/dev/null
log "ecr" "logged in"

# ---------- 3. compose build ----------
# Compose auto-reads ./.env for build args (Stripe/Supabase/Encryption keys).
# Outputs local images: llmhub-backend:latest, llmhub-frontend:latest
log "build" "docker compose -f $COMPOSE_FILE build"
docker compose -f "$COMPOSE_FILE" build

# ---------- 4. tag for ECR ----------
log "tag"  "tagging images for $ECR_HOST"
docker tag "llmhub-backend:latest"  "${ECR_HOST}/${BACKEND_REPO}:${IMAGE_TAG}"
docker tag "llmhub-frontend:latest" "${ECR_HOST}/${FRONTEND_REPO}:${IMAGE_TAG}"

# ---------- 5. push (parallel) ----------
log "push" "pushing in parallel"
docker push "${ECR_HOST}/${BACKEND_REPO}:${IMAGE_TAG}" &
BE_PID=$!
docker push "${ECR_HOST}/${FRONTEND_REPO}:${IMAGE_TAG}" &
FE_PID=$!

BE_RC=0; FE_RC=0
wait "$BE_PID" || BE_RC=$?
wait "$FE_PID" || FE_RC=$?

[[ $BE_RC -ne 0 ]] && fail "backend"  "push failed (rc=$BE_RC)"
[[ $FE_RC -ne 0 ]] && fail "frontend" "push failed (rc=$FE_RC)"
[[ $BE_RC -ne 0 || $FE_RC -ne 0 ]] && exit 1

log "push" "$ECR_HOST/$BACKEND_REPO:$IMAGE_TAG"
log "push" "$ECR_HOST/$FRONTEND_REPO:$IMAGE_TAG"

# ---------- 6. terraform apply ----------
TF_DIR="${TF_DIR:-infra/aws}"
if [[ "${SKIP_TERRAFORM:-}" == "1" ]]; then
  log "tf" "SKIP_TERRAFORM=1 -- skipping terraform apply"
else
  require_cmd terraform
  if [[ ! -d "$REPO_ROOT/$TF_DIR" ]]; then
    fail "tf" "$TF_DIR not found in repo root"
    exit 1
  fi
  log "tf" "running 'terraform apply' in $TF_DIR (you will be prompted to type 'yes')"
  TF_RC=0
  ( cd "$REPO_ROOT/$TF_DIR" && terraform apply ) || TF_RC=$?
  if [[ $TF_RC -ne 0 ]]; then
    fail "tf" "terraform apply failed (rc=$TF_RC) -- images already pushed to ECR"
    exit 1
  fi
  log "tf" "terraform apply completed"
fi

log "done" "build, push, and terraform apply complete"
