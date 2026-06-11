"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingSectionHeader } from "../section-shell"

/* ===================================================================
   Developer view of the landing page — rendered when the hero's
   audience toggle is on "Developers". Four quiet sections: quickstart,
   the API surface, metered pricing, and a short FAQ. English-only by
   design, matching /api-docs (the docs surface is not translated).
   Every endpoint, price, and behavior stated here comes verbatim from
   lib/openapi/coasty-v1.ts, lib/coasty-api-docs-md.ts, and the billing
   constants — nothing is invented for marketing.
   =================================================================== */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Shared whileInView reveal, same once-only viewport pattern as the
// sibling sections (no isMobile-conditional motion props).
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, delay, ease: EASE },
})

/* ─── Quickstart ─── */

const QUICKSTART_STEPS = [
  {
    step: "01",
    title: "Mint a key",
    body: "Create a key in the dashboard. Test keys are free and fully sandboxed: mock machines, nothing billed.",
    code: "sk-coasty-test-…",
  },
  {
    step: "02",
    title: "Ask for the next action",
    body: "Send a screenshot and a plain-English instruction. You get back structured actions with exact coordinates.",
    code: "POST /v1/predict",
  },
  {
    step: "03",
    title: "Execute anywhere",
    body: "Run the actions with pyautogui or Playwright on your own machines, or on managed VMs we provision for you.",
    code: "POST /v1/machines",
  },
] as const

export function DevQuickstartSection({ isMobile }: { isMobile: boolean }) {
  return (
    <section className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <LandingSectionHeader
          isMobile={isMobile}
          title="From key to clicked button in three calls"
          subtitle="Plain HTTPS and JSON. No SDK required."
        />

        <motion.div
          {...reveal(0.05)}
          className="grid overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.06] gap-px sm:grid-cols-3"
        >
          {QUICKSTART_STEPS.map((s) => (
            <div key={s.step} className="bg-background p-6 sm:p-7">
              <div className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/50">
                {s.step}
              </div>
              <h3 className="mt-3 text-[15px] font-medium tracking-[-0.01em] text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-muted-foreground/70">
                {s.body}
              </p>
              <code className="mt-4 inline-block rounded-md border border-foreground/[0.07] bg-foreground/[0.03] px-2 py-1 font-mono text-[11px] text-muted-foreground">
                {s.code}
              </code>
            </div>
          ))}
        </motion.div>

        <motion.div {...reveal(0.1)} className="mt-8 text-center">
          <Link
            href="/api-docs"
            className="group inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            Read the quickstart
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── API surface ─── */

const CAPABILITIES = [
  {
    name: "Predict & ground",
    path: "POST /v1/predict · /v1/ground",
    desc: "Screenshot in, structured actions out, with (x, y) grounding for any UI element.",
  },
  {
    name: "Sessions",
    path: "POST /v1/sessions",
    desc: "Stateful, multi-step trajectories that remember what the agent has done so far.",
  },
  {
    name: "Machines",
    path: "POST /v1/machines",
    desc: "Provision Linux or Windows VMs with a terminal, files, and a full browser API.",
  },
  {
    name: "Schedules",
    path: "POST /v1/schedules",
    desc: "Cron or one-shot jobs that run unattended, with per-run history.",
  },
  {
    name: "Triggers",
    path: "POST /v1/schedules/{id}/triggers",
    desc: "Fire schedules from HMAC-signed webhooks or a provisioned inbound email address.",
  },
  {
    name: "Keys & usage",
    path: "GET /v1/usage",
    desc: "Scoped keys with one-time reveal, plus per-period usage reporting.",
  },
] as const

export function DevCapabilitiesSection({ isMobile }: { isMobile: boolean }) {
  return (
    <section className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-5xl">
        <LandingSectionHeader
          isMobile={isMobile}
          title="The entire computer is an API"
          subtitle="Six surfaces, one key: predict, sessions, machines, schedules, triggers, and usage."
        />

        <motion.div
          {...reveal(0.05)}
          className="grid overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.06] gap-px sm:grid-cols-2 lg:grid-cols-3"
        >
          {CAPABILITIES.map((c) => (
            <div key={c.name} className="bg-background p-6 sm:p-7">
              <h3 className="text-[15px] font-medium tracking-[-0.01em] text-foreground">
                {c.name}
              </h3>
              <div className="mt-1.5 font-mono text-[11px] text-muted-foreground/55">
                {c.path}
              </div>
              <p className="mt-3 text-[13px] leading-[1.6] text-muted-foreground/70">
                {c.desc}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Pricing ─── */

// Prices mirror the "Pricing (USD)" table in the API docs
// (lib/coasty-api-docs-md.ts) — keep the two in lockstep.
const PRICE_ROWS = [
  { item: "Action prediction", path: "POST /v1/predict", price: "$0.05" },
  { item: "Create a session", path: "POST /v1/sessions", price: "$0.10" },
  { item: "Session step", path: "POST /v1/sessions/{id}/predict", price: "$0.04" },
  { item: "Coordinate grounding", path: "POST /v1/ground", price: "$0.03" },
  { item: "Parse actions", path: "POST /v1/parse", price: "Free" },
  { item: "Agent run", path: "POST /v1/runs", price: "$0.05 / step" },
  { item: "Workflow run", path: "POST /v1/workflows/runs", price: "$0.05 / step" },
  { item: "Linux machine, running", path: null, price: "$0.05 / hr" },
  { item: "Windows machine, running", path: null, price: "$0.09 / hr" },
  { item: "Any machine, stopped", path: null, price: "$0.01 / hr" },
] as const

export function DevPricingSection({ isMobile }: { isMobile: boolean }) {
  return (
    <section className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-3xl">
        <LandingSectionHeader
          isMobile={isMobile}
          title="Metered, not tiered"
          subtitle="Fixed dollar prices per call, from a prepaid wallet. Top up $5 to $5,000. No subscription required."
        />

        <motion.div
          {...reveal(0.05)}
          className="overflow-hidden rounded-2xl border border-foreground/[0.08]"
        >
          <div className="divide-y divide-foreground/[0.06]">
            {PRICE_ROWS.map((r) => (
              <div
                key={r.item}
                className={cn(
                  "flex items-baseline justify-between gap-4 px-5 sm:px-6",
                  isMobile ? "py-3.5" : "py-4",
                )}
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-foreground/85">{r.item}</div>
                  {r.path && (
                    <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/50">
                      {r.path}
                    </div>
                  )}
                </div>
                <div className="shrink-0 font-mono text-[12.5px] tabular-nums text-muted-foreground">
                  {r.price}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.p
          {...reveal(0.1)}
          className="mt-5 text-center text-[12px] leading-[1.6] text-muted-foreground/55"
        >
          Charges are taken before the call and refunded on failure. Test keys are
          never billed, and every response reports what it cost and what remains.
        </motion.p>

        <motion.div {...reveal(0.12)} className="mt-8 flex items-center justify-center">
          <Link
            href="/auth"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-[13.5px] font-medium text-background transition-transform duration-200 hover:opacity-90 active:scale-[0.98]"
          >
            Get your API key
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

/* ─── Developer FAQ ─── */

const DEV_FAQS = [
  {
    q: "How do I authenticate?",
    a: "Every /v1 endpoint accepts an X-API-Key header or an Authorization: Bearer token. Keys are minted in the dashboard and shown in full exactly once.",
  },
  {
    q: "What can I try for free?",
    a: "Test keys (sk-coasty-test-…) are fully sandboxed: machine calls return mocks and nothing is ever billed. Parsing actions with /v1/parse is free on any key.",
  },
  {
    q: "How does billing work?",
    a: "You prepay a dollar wallet that is independent of any Coasty subscription. Every call has a fixed dollar price, charged up front and refunded if the call fails, and every response reports what it cost and what remains.",
  },
  {
    q: "Can it run unattended?",
    a: "Yes. Schedules run cron or one-shot jobs, webhook and email triggers fire them from the outside, and idempotency keys make retries safe.",
  },
] as const

export function DevFaqSection({ isMobile }: { isMobile: boolean }) {
  return (
    <section className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-2xl">
        <LandingSectionHeader isMobile={isMobile} title="Developer FAQ" />

        <motion.div {...reveal(0.05)} className="divide-y divide-foreground/[0.06]">
          {DEV_FAQS.map((f) => (
            <div key={f.q} className="py-5">
              <h3 className="text-[14.5px] font-medium tracking-[-0.01em] text-foreground">
                {f.q}
              </h3>
              <p className="mt-2 text-[13px] leading-[1.65] text-muted-foreground/70">{f.a}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
