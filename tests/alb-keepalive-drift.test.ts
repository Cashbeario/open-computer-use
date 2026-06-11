/**
 * Keep-alive vs ALB idle-timeout drift guard.
 *
 * Rule (AWS guidance): every HTTP server behind the ALB must keep idle
 * connections open LONGER than the ALB's idle timeout, so the ALB is always
 * the side that closes first. If the server closes first, the ALB reuses a
 * dead socket and the request dies with a sporadic 502 that looks like
 * infrastructure flakiness (2026-06-11 incident analysis).
 *
 * The ALB idle timeout is 3600s (deliberately high for SSE/WS — do not
 * lower it; see project notes). Both origin servers must stay above it:
 *  - Next.js standalone: Node's default keepAliveTimeout is 5s; the
 *    standalone server.js reads KEEP_ALIVE_TIMEOUT (milliseconds) from the
 *    environment, set in the Dockerfile.
 *  - FastAPI: gunicorn's `keepalive` setting is a NO-OP under UvicornWorker
 *    (uvicorn's 5s default applied instead!). The CoastyUvicornWorker
 *    subclass passes timeout_keep_alive explicitly.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..")
const ALB_IDLE_TIMEOUT_S = 3600

describe("Next.js standalone keep-alive", () => {
  const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf-8")

  it("Dockerfile sets KEEP_ALIVE_TIMEOUT above the ALB idle timeout", () => {
    const m = dockerfile.match(/^ENV KEEP_ALIVE_TIMEOUT=(\d+)\s*$/m)
    expect(m, "ENV KEEP_ALIVE_TIMEOUT=<ms> missing from Dockerfile").toBeTruthy()
    expect(Number(m![1])).toBeGreaterThan(ALB_IDLE_TIMEOUT_S * 1000)
  })
})

describe("FastAPI (gunicorn + uvicorn) keep-alive", () => {
  const gunicornConf = readFileSync(
    join(ROOT, "backend", "gunicorn_conf.py"),
    "utf-8"
  )
  const worker = readFileSync(
    join(ROOT, "backend", "app", "core", "uvicorn_worker.py"),
    "utf-8"
  )

  it("gunicorn uses the CoastyUvicornWorker subclass (plain UvicornWorker ignores `keepalive`)", () => {
    expect(gunicornConf).toContain(
      'worker_class = "app.core.uvicorn_worker.CoastyUvicornWorker"'
    )
  })

  it("worker sets timeout_keep_alive above the ALB idle timeout", () => {
    expect(worker).toContain('"timeout_keep_alive"')
    const m = worker.match(/UVICORN_TIMEOUT_KEEP_ALIVE",\s*"(\d+)"/)
    expect(m, "default for UVICORN_TIMEOUT_KEEP_ALIVE missing").toBeTruthy()
    expect(Number(m![1])).toBeGreaterThan(ALB_IDLE_TIMEOUT_S)
  })
})
