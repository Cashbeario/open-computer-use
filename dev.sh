#!/usr/bin/env bash
# dev.sh - Run frontend (Next.js) and/or backend (FastAPI).
#
# Usage:
#   ./dev.sh            # both (default)
#   ./dev.sh both       # both
#   ./dev.sh frontend   # frontend only (alias: fe)
#   ./dev.sh backend    # backend only  (alias: be)
#
# Ctrl+C stops whatever was started and frees the relevant ports (3000/8001).

set -m  # job control: each background job gets its own process group

ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDS=()

# Resolve which services to run from the (case-insensitive) target argument.
TARGET="${1:-both}"
RUN_FE=0
RUN_BE=0
case "$(printf '%s' "$TARGET" | tr '[:upper:]' '[:lower:]')" in
    both|all)              RUN_FE=1; RUN_BE=1 ;;
    frontend|fe|front)     RUN_FE=1; RUN_BE=0 ;;
    backend|be|back)       RUN_FE=0; RUN_BE=1 ;;
    -h|--help|help)
        sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
        exit 0
        ;;
    *)
        echo "[dev] Unknown target: '$TARGET'"
        echo "[dev] Use one of: both | frontend (fe) | backend (be)"
        exit 1
        ;;
esac

# Only free the ports for the services we actually start.
PORTS=()
[ "$RUN_FE" -eq 1 ] && PORTS+=(3000)
[ "$RUN_BE" -eq 1 ] && PORTS+=(8001)

cleanup() {
    trap - INT TERM EXIT
    echo
    echo "[dev] Stopping servers..."

    for pid in "${PIDS[@]}"; do
        # Negative pid = whole process group (npm -> node -> next dev, etc.)
        kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    done

    sleep 1

    for pid in "${PIDS[@]}"; do
        kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    done

    # Belt-and-suspenders: free the ports if anything is still listening.
    for port in "${PORTS[@]}"; do
        if command -v lsof >/dev/null 2>&1; then
            pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
            [ -n "$pids" ] && kill -KILL $pids 2>/dev/null || true
        elif command -v fuser >/dev/null 2>&1; then
            fuser -k "${port}/tcp" 2>/dev/null || true
        fi
    done

    echo "[dev] Stopped."
}

trap cleanup INT TERM EXIT

if [ "$RUN_BE" -eq 1 ]; then
    VENV_PY="$ROOT/backend/venv/bin/python"
    if [ ! -x "$VENV_PY" ]; then
        echo "[dev] venv missing at $VENV_PY"
        echo "[dev] Run backend/run_backend.sh once to create it, then re-run dev.sh."
        exit 1
    fi

    echo "[dev] Starting backend  (FastAPI on :8001)..."
    (
        cd "$ROOT/backend"
        export DEBUG="${DEBUG:-true}"
        export ENVIRONMENT="${ENVIRONMENT:-development}"
        exec "$VENV_PY" main.py
    ) &
    PIDS+=($!)
fi

if [ "$RUN_BE" -eq 1 ] && [ "$RUN_FE" -eq 1 ]; then
    sleep 0.4
fi

if [ "$RUN_FE" -eq 1 ]; then
    echo "[dev] Starting frontend (Next.js on :3000)..."
    (
        cd "$ROOT"
        exec npm run dev
    ) &
    PIDS+=($!)
fi

echo
[ "$RUN_FE" -eq 1 ] && echo "[dev]  Frontend  http://localhost:3000"
[ "$RUN_BE" -eq 1 ] && echo "[dev]  Backend   http://localhost:8001"
echo "[dev]  Ctrl+C to stop."
echo

# Wait for any started job to exit; the EXIT trap then tears down the rest.
wait -n
