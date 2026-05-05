"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import {
  Code,
  Terminal,
  ArrowRight,
  Key,
  Lightning,
  CursorClick,
  Eye,
  Textbox,
  BracketsAngle,
  Plugs,
  ListBullets,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

/* ─── animations ─── */

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

/* ─── language tab selector ─── */

const LANGS = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "go", label: "Go" },
  { id: "curl", label: "cURL" },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
  { id: "java", label: "Java" },
  { id: "csharp", label: "C#" },
] as const

type LangId = (typeof LANGS)[number]["id"]

/* ─── code snippets per language ─── */

const SNIPPETS: Record<LangId, { install?: string; predict: string; session: string }> = {
  python: {
    install: "pip install requests",
    predict: `import requests, base64

API_KEY = "sk-coasty-live-..."
img = base64.b64encode(open("screen.png", "rb").read()).decode()

r = requests.post(
    "https://coasty.ai/v1/predict",
    headers={"X-API-Key": API_KEY},
    json={
        "screenshot": img,
        "instruction": "Click the search bar and type 'hello'",
    },
)

for action in r.json()["actions"]:
    print(action["action_type"], action["params"])`,
    session: `# Create a session for multi-step tasks
s = requests.post(
    "https://coasty.ai/v1/sessions",
    headers={"X-API-Key": API_KEY},
    json={"cua_version": "v3", "screen_width": 1920, "screen_height": 1080},
).json()

session_id = s["session_id"]

# Send screenshots in a loop
while True:
    screenshot = capture_screenshot()  # your screenshot function
    r = requests.post(
        f"https://coasty.ai/v1/sessions/{session_id}/predict",
        headers={"X-API-Key": API_KEY},
        json={"screenshot": screenshot, "instruction": "Complete the form"},
    ).json()

    for action in r["actions"]:
        execute_action(action)  # your action executor

    if r["status"] in ("done", "fail"):
        break`,
  },
  javascript: {
    install: "npm install node-fetch  # or use built-in fetch",
    predict: `const fs = require("fs");

const API_KEY = "sk-coasty-live-...";
const screenshot = fs.readFileSync("screen.png").toString("base64");

const res = await fetch("https://coasty.ai/v1/predict", {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    screenshot,
    instruction: "Click the search bar and type 'hello'",
  }),
});

const { actions, reasoning, status } = await res.json();
actions.forEach(a => console.log(a.action_type, a.params));`,
    session: `// Create session
const session = await fetch("https://coasty.ai/v1/sessions", {
  method: "POST",
  headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ cua_version: "v3" }),
}).then(r => r.json());

// Predict loop
let status = "continue";
while (status === "continue") {
  const screenshot = await captureScreenshot();
  const res = await fetch(
    \`https://coasty.ai/v1/sessions/\${session.session_id}/predict\`,
    {
      method: "POST",
      headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ screenshot, instruction: "Complete the form" }),
    }
  ).then(r => r.json());

  for (const action of res.actions) await executeAction(action);
  status = res.status;
}`,
  },
  go: {
    install: "go get github.com/go-resty/resty/v2",
    predict: `package main

import (
    "encoding/base64"
    "encoding/json"
    "fmt"
    "os"

    "github.com/go-resty/resty/v2"
)

func main() {
    img, _ := os.ReadFile("screen.png")
    b64 := base64.StdEncoding.EncodeToString(img)

    client := resty.New()
    resp, _ := client.R().
        SetHeader("X-API-Key", "sk-coasty-live-...").
        SetHeader("Content-Type", "application/json").
        SetBody(map[string]interface{}{
            "screenshot":  b64,
            "instruction": "Click the search bar",
        }).
        Post("https://coasty.ai/v1/predict")

    var result map[string]interface{}
    json.Unmarshal(resp.Body(), &result)
    fmt.Println(result["actions"])
}`,
    session: `// Sessions follow the same pattern — POST to /sessions,
// then loop POST to /sessions/{id}/predict`,
  },
  curl: {
    predict: `# Encode screenshot
SCREENSHOT=$(base64 -w 0 screen.png)

curl -X POST https://coasty.ai/v1/predict \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"screenshot\\": \\"$SCREENSHOT\\",
    \\"instruction\\": \\"Click the login button\\"
  }"`,
    session: `# Create session
curl -X POST https://coasty.ai/v1/sessions \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{"cua_version": "v3"}'

# Predict within session
curl -X POST https://coasty.ai/v1/sessions/{SESSION_ID}/predict \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"screenshot\\": \\"$SCREENSHOT\\",
    \\"instruction\\": \\"Fill the form\\"
  }"`,
  },
  ruby: {
    install: "gem install httparty",
    predict: `require "httparty"
require "base64"
require "json"

api_key = "sk-coasty-live-..."
screenshot = Base64.strict_encode64(File.read("screen.png"))

response = HTTParty.post(
  "https://coasty.ai/v1/predict",
  headers: { "X-API-Key" => api_key, "Content-Type" => "application/json" },
  body: {
    screenshot: screenshot,
    instruction: "Click the search bar and type 'hello'"
  }.to_json
)

JSON.parse(response.body)["actions"].each do |action|
  puts "#{action['action_type']}: #{action['params']}"
end`,
    session: `# Same pattern — POST /sessions, then loop /sessions/{id}/predict`,
  },
  php: {
    predict: `<?php
$apiKey = "sk-coasty-live-...";
$screenshot = base64_encode(file_get_contents("screen.png"));

$ch = curl_init("https://coasty.ai/v1/predict");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "X-API-Key: $apiKey",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "screenshot" => $screenshot,
        "instruction" => "Click the search bar",
    ]),
]);

$result = json_decode(curl_exec($ch), true);
foreach ($result["actions"] as $action) {
    echo $action["action_type"] . ": " . json_encode($action["params"]) . "\\n";
}`,
    session: `// Same pattern — POST /sessions, then loop /sessions/{id}/predict`,
  },
  java: {
    predict: `import java.net.http.*;
import java.nio.file.*;
import java.util.Base64;

var apiKey = "sk-coasty-live-...";
var img = Base64.getEncoder().encodeToString(Files.readAllBytes(Path.of("screen.png")));

var body = """
  {"screenshot": "%s", "instruction": "Click the search bar"}
  """.formatted(img);

var request = HttpRequest.newBuilder()
    .uri(URI.create("https://coasty.ai/v1/predict"))
    .header("X-API-Key", apiKey)
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();

var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
    session: `// Same pattern — POST /sessions, then loop /sessions/{id}/predict`,
  },
  csharp: {
    install: "dotnet add package System.Net.Http.Json",
    predict: `using System.Net.Http.Json;

var apiKey = "sk-coasty-live-...";
var screenshot = Convert.ToBase64String(File.ReadAllBytes("screen.png"));

using var client = new HttpClient();
client.DefaultRequestHeaders.Add("X-API-Key", apiKey);

var response = await client.PostAsJsonAsync(
    "https://coasty.ai/v1/predict",
    new {
        screenshot,
        instruction = "Click the search bar and type 'hello'"
    }
);

var result = await response.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine(result.GetProperty("actions"));`,
    session: `// Same pattern — POST /sessions, then loop /sessions/{id}/predict`,
  },
}

/* ─── gradient palettes for sections ─── */

const SECTION_GRADIENTS = [
  { from: "#6366f120", via: "#a78bfa15", to: "#818cf810" },  // indigo-violet
  { from: "#3b82f620", via: "#8b5cf615", to: "#60a5fa10" },  // blue-purple
  { from: "#06b6d420", via: "#6366f115", to: "#22d3ee10" },  // cyan-indigo
  { from: "#8b5cf620", via: "#ec489915", to: "#c084fc10" },  // purple-pink
  { from: "#10b98120", via: "#06b6d415", to: "#34d39910" },  // emerald-cyan
  { from: "#f59e0b20", via: "#ef444415", to: "#fbbf2410" },  // amber-red
  { from: "#ec489920", via: "#8b5cf615", to: "#f9a8d410" },  // pink-purple
  { from: "#14b8a620", via: "#3b82f615", to: "#2dd4bf10" },  // teal-blue
] as const

let sectionCounter = 0

/* ─── code block ─── */

function GuideCodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative rounded-xl border border-foreground/[0.06] overflow-hidden group/code">
      {/* Subtle gradient top edge */}
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />

      {label && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/[0.04] bg-foreground/[0.015] dark:bg-foreground/[0.03]">
          <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wider">{label}</span>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="text-[10px] text-muted-foreground/25 hover:text-foreground/60 transition-colors"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className="relative bg-foreground/[0.01] dark:bg-foreground/[0.02]">
        <pre className="px-5 py-5 text-[12px] leading-[1.7] font-mono text-foreground/60 overflow-x-auto scrollbar-invisible">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}

/* ─── section divider ─── */

function SectionDivider() {
  return (
    <div className="py-4">
      <div className="h-px bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
    </div>
  )
}

/* ─── section wrapper with gradient accent ─── */

function Section({ id, title, children, icon: Icon, description }: {
  id?: string; title: string; children: React.ReactNode; icon: typeof Code; description?: string
}) {
  const gradientIndex = useMemo(() => sectionCounter++ % SECTION_GRADIENTS.length, [])
  const g = SECTION_GRADIENTS[gradientIndex]

  return (
    <motion.section id={id} variants={fadeUp} className="relative space-y-7 scroll-mt-24 rounded-2xl border border-border/[0.06] p-7 sm:p-9 overflow-hidden">
      {/* Aurora gradient header strip */}
      <div
        className="absolute inset-x-0 top-0 h-32 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${g.from} 0%, ${g.via} 40%, ${g.to} 100%)`,
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />

      <div className="relative space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 border border-border/20 shadow-sm">
            <Icon size={15} weight="duotone" className="text-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        {description && (
          <p className="text-[13px] text-muted-foreground/55 leading-relaxed pl-[42px]">{description}</p>
        )}
      </div>
      <div className="relative space-y-5">
        {children}
      </div>
    </motion.section>
  )
}

/* ─── docs nav data + active-section hook ─── */

type DocSection = { id: string; title: string; icon: PhosphorIcon; group: "Start" | "Reference" | "Errors" }

const DOC_SECTIONS: DocSection[] = [
  { id: "authentication", title: "Authentication",  icon: Key,           group: "Start" },
  { id: "how-it-works",   title: "How it Works",    icon: CursorClick,   group: "Start" },
  { id: "quickstart",     title: "Quick Start",     icon: Lightning,     group: "Start" },
  { id: "response",       title: "Response Format", icon: BracketsAngle, group: "Reference" },
  { id: "actions",        title: "Action Types",    icon: CursorClick,   group: "Reference" },
  { id: "options",        title: "Request Options", icon: Textbox,       group: "Reference" },
  { id: "endpoints",      title: "All Endpoints",   icon: Terminal,      group: "Reference" },
  { id: "errors",         title: "Error Handling",  icon: Eye,           group: "Errors" },
]

function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string>(ids[0] ?? "")
  // Track most recent visibility ratio per section so we can pick the dominant one.
  const visibleMap = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          visibleMap.current.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        }
        let bestId = ""
        let bestRatio = 0
        visibleMap.current.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestId = id
          }
        })
        if (bestId && bestRatio > 0) setActive(bestId)
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [ids])

  return active
}

/* ─── docs sidebar nav ─── */

function DocsSidebar({ active }: { active: string }) {
  const grouped = useMemo(() => {
    const map = new Map<DocSection["group"], DocSection[]>()
    for (const s of DOC_SECTIONS) {
      const arr = map.get(s.group) ?? []
      arr.push(s)
      map.set(s.group, arr)
    }
    return Array.from(map.entries())
  }, [])

  const onJump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    if (typeof history !== "undefined") {
      history.replaceState(null, "", `#${id}`)
    }
  }

  return (
    <nav aria-label="API documentation sections" className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <ListBullets size={13} weight="duotone" className="text-muted-foreground/40" />
        <span className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-[0.16em]">
          On this page
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {grouped.map(([group, items]) => (
          <div key={group} className="flex flex-col gap-1.5">
            <span className="px-2 text-[9.5px] font-semibold text-muted-foreground/35 uppercase tracking-[0.18em]">
              {group}
            </span>
            <ul className="flex flex-col">
              {items.map((s) => {
                const isActive = active === s.id
                const Icon = s.icon
                return (
                  <li key={s.id} className="relative">
                    {isActive && (
                      <motion.span
                        layoutId="docs-nav-active"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[1.5px] rounded-full bg-foreground/80"
                      />
                    )}
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => onJump(e, s.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-md text-[12.5px] font-medium transition-colors duration-150",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground/55 hover:text-foreground/85",
                      )}
                    >
                      <Icon
                        size={13}
                        weight={isActive ? "fill" : "duotone"}
                        className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-foreground/80" : "text-muted-foreground/35 group-hover:text-foreground/55",
                        )}
                      />
                      <span className="truncate">{s.title}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-border/30">
        <a
          href="#authentication"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById("authentication")?.scrollIntoView({ behavior: "smooth", block: "start" })
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/45 hover:text-foreground transition-colors"
        >
          <ArrowRight size={11} className="rotate-[-90deg]" />
          Back to top
        </a>
      </div>
    </nav>
  )
}

/* ─── main component ─── */

export function APITab({ inApp }: { inApp: boolean }) {
  const [lang, setLang] = useState<LangId>("python")
  const snippet = SNIPPETS[lang]
  const sectionIds = useMemo(() => DOC_SECTIONS.map((s) => s.id), [])
  const active = useActiveSection(sectionIds)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-0">

      {/* ════ Hero ════ */}
      <motion.div variants={fadeUp} className="relative rounded-2xl border border-foreground/[0.06] bg-foreground/[0.015] overflow-hidden mb-14">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-foreground/[0.02] blur-3xl" />
          <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-foreground/[0.02] blur-3xl" />
        </div>
        <div className="relative px-8 py-12 sm:py-14">
          <div className="flex items-center gap-2 mb-5">
            <Plugs size={18} weight="duotone" className="text-foreground/40" />
            <span className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-[0.15em]">Computer Use API</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 max-w-lg">
            Send a screenshot, get actions back
          </h2>
          <p className="text-sm sm:text-[15px] text-muted-foreground/55 leading-relaxed max-w-xl mb-8">
            The CUA API gives your code the ability to see and interact with any screen. Send a screenshot and a natural language instruction — receive structured mouse clicks, keyboard inputs, and scroll commands with exact coordinates.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {inApp ? (
              <Link
                href="/developers"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all bg-foreground text-background hover:bg-foreground/90"
              >
                Get API Key
                <ArrowRight size={14} />
              </Link>
            ) : (
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all bg-foreground text-background hover:bg-foreground/90"
              >
                Get Started
                <ArrowRight size={14} />
              </Link>
            )}
            <a
              href="#quickstart"
              className="inline-flex items-center gap-1.5 rounded-xl border border-foreground/[0.08] px-5 py-2.5 text-sm font-medium text-muted-foreground/70 hover:text-foreground hover:border-foreground/[0.15] transition-all"
            >
              <Code size={14} weight="duotone" />
              Jump to Quick Start
            </a>
          </div>
        </div>
      </motion.div>

      {/* ════ Sticky sidebar nav + main docs body ════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] xl:grid-cols-[220px_1fr] gap-x-12 gap-y-0">
        {/* Sidebar — sticky, hidden on mobile */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <DocsSidebar active={active} />
          </div>
        </aside>

        {/* Mobile section picker — horizontal pill bar */}
        <div className="lg:hidden -mx-1 mb-6 overflow-x-auto scrollbar-invisible">
          <div className="flex items-center gap-1.5 px-1 min-w-max">
            {DOC_SECTIONS.map((s) => {
              const Icon = s.icon
              const isActive = active === s.id
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11.5px] font-medium transition-colors",
                    isActive
                      ? "border-foreground/25 bg-foreground/[0.05] text-foreground"
                      : "border-border/40 bg-card/40 text-muted-foreground/65 hover:text-foreground hover:border-border/70",
                  )}
                >
                  <Icon size={12} weight={isActive ? "fill" : "duotone"} />
                  {s.title}
                </a>
              )
            })}
          </div>
        </div>

        {/* Main docs body */}
        <div className="min-w-0 space-y-0">

      {/* ════ Auth + How it Works ════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-7 mb-8">
        <motion.div variants={fadeUp}>
          <Section id="authentication" title="Authentication" icon={Key}>
            <p className="text-[13px] text-muted-foreground/55 leading-relaxed">
              Every request needs an <code className="text-[11px] px-1.5 py-0.5 rounded-md bg-foreground/[0.04] font-mono">X-API-Key</code> header.
              {inApp ? (
                <> Create keys in your <Link href="/developers" className="underline underline-offset-2 hover:text-foreground transition-colors">Developer Dashboard</Link>.</>
              ) : (
                <> Sign up to create API keys.</>
              )} Credits are deducted per request from your shared balance.
            </p>
            <GuideCodeBlock label="header" code="X-API-Key: sk-coasty-live-your_key_here" />
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section id="how-it-works" title="How it Works" icon={CursorClick}>
            <div className="space-y-3.5">
              {[
                { step: "1", text: "Capture a screenshot of the target screen" },
                { step: "2", text: "Send it with a natural language instruction" },
                { step: "3", text: "Receive structured actions (click, type, scroll...)" },
                { step: "4", text: "Execute the actions in your environment" },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3.5">
                  <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-lg bg-foreground/[0.05] text-[11px] font-bold text-foreground/50">{s.step}</span>
                  <span className="text-[13px] text-muted-foreground/55 leading-relaxed pt-0.5">{s.text}</span>
                </div>
              ))}
            </div>
          </Section>
        </motion.div>
      </div>

      <SectionDivider />

      {/* ════ Quick Start ════ */}
      <div className="py-8 mb-8">
        <Section id="quickstart" title="Quick Start" icon={Lightning} description="Choose your language. The predict endpoint is the core of the API — everything else builds on it.">
          {/* Language selector */}
          <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-foreground/[0.025] border border-foreground/[0.04] w-fit">
            {LANGS.map(l => (
              <button
                key={l.id}
                onClick={() => setLang(l.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150",
                  lang === l.id
                    ? "bg-background shadow-sm text-foreground border border-foreground/[0.06]"
                    : "text-muted-foreground/45 hover:text-foreground/70"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>

          {snippet.install && (
            <GuideCodeBlock label="install" code={snippet.install} />
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-7">
            <GuideCodeBlock label="predict — single screenshot" code={snippet.predict} />
            <GuideCodeBlock label="sessions — multi-step tasks" code={snippet.session} />
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════ Response Format ════ */}
      <div className="py-8 mb-8">
        <Section id="response" title="Response Format" icon={BracketsAngle} description="Every prediction returns structured actions with exact coordinates, a status signal, and token usage.">
          <GuideCodeBlock
            label="response"
            code={`{
  "request_id": "req_abc123",
  "actions": [
    {
      "action_type": "click",
      "params": { "x": 512, "y": 340, "button": "left", "clicks": 1 }
    },
    {
      "action_type": "type_text",
      "params": { "text": "hello world" }
    }
  ],
  "reasoning": "I see a search bar at (512, 340)...",
  "status": "continue",
  "usage": {
    "input_tokens": 1523,
    "output_tokens": 245,
    "credits_charged": 5
  }
}`}
          />
        </Section>
      </div>

      <SectionDivider />

      {/* ════ Action Types + Request Options ════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-7 py-8 mb-8">
        <motion.div variants={fadeUp}>
          <Section id="actions" title="Action Types" icon={CursorClick}>
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden divide-y divide-foreground/[0.04]">
              {[
                { type: "click", desc: "Mouse click at (x, y)" },
                { type: "type_text", desc: "Type a string" },
                { type: "key_press", desc: "Press a key (enter, tab...)" },
                { type: "key_combo", desc: "Combo (ctrl+c, cmd+v...)" },
                { type: "scroll", desc: "Scroll at a position" },
                { type: "drag", desc: "Drag between two points" },
                { type: "move", desc: "Move cursor" },
                { type: "wait", desc: "Pause execution" },
                { type: "done", desc: "Task completed" },
                { type: "fail", desc: "Task impossible" },
              ].map(row => (
                <div key={row.type} className="flex items-center gap-3 px-5 py-3">
                  <code className="text-[11px] font-mono font-semibold text-foreground/65 w-20 shrink-0">{row.type}</code>
                  <span className="text-[12px] text-muted-foreground/45 flex-1">{row.desc}</span>
                </div>
              ))}
            </div>
          </Section>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Section id="options" title="Request Options" icon={Textbox} description="Only screenshot and instruction are required.">
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden divide-y divide-foreground/[0.04]">
              {[
                { f: "screenshot", t: "string", req: true },
                { f: "instruction", t: "string", req: true },
                { f: "cua_version", t: '"v3" | "v1"', req: false },
                { f: "screen_width", t: "int", req: false },
                { f: "screen_height", t: "int", req: false },
                { f: "max_actions", t: "int (1-10)", req: false },
                { f: "trajectory", t: "array", req: false },
                { f: "system_prompt", t: "string", req: false },
                { f: "tools", t: "string[]", req: false },
              ].map(row => (
                <div key={row.f} className="flex items-center gap-3 px-5 py-3">
                  <code className="text-[11px] font-mono font-semibold text-foreground/65 w-28 shrink-0">{row.f}</code>
                  <span className="text-[11px] font-mono text-muted-foreground/30 flex-1">{row.t}</span>
                  {row.req && <span className="text-[9px] font-semibold text-rose-500/50 shrink-0 uppercase tracking-wider">required</span>}
                </div>
              ))}
            </div>
          </Section>
        </motion.div>
      </div>

      <SectionDivider />

      {/* ════ Endpoints ════ */}
      <div className="py-8 mb-8">
        <Section id="endpoints" title="All Endpoints" icon={Terminal} description="All endpoints require the X-API-Key header. Credits deducted from your shared balance.">
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            {/* Group: Prediction */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Prediction</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST", p: "/v1/predict", d: "Stateless prediction", c: "5 cr" },
                { m: "POST", p: "/v1/sessions", d: "Create session", c: "10 cr" },
                { m: "POST", p: "/v1/sessions/{id}/predict", d: "Session prediction", c: "4 cr" },
                { m: "POST", p: "/v1/sessions/{id}/reset", d: "Reset session", c: "Free" },
                { m: "DELETE", p: "/v1/sessions/{id}", d: "Delete session", c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "POST" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-40 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-12 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* Group: Utilities */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Utilities</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST", p: "/v1/ground", d: "Find (x,y) for element", c: "3 cr" },
                { m: "POST", p: "/v1/ocr", d: "Extract text from image", c: "3 cr" },
                { m: "POST", p: "/v1/parse", d: "Parse pyautogui code", c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-40 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-12 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* Group: Management */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Management</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "GET", p: "/v1/models", d: "List available versions", c: "Free" },
                { m: "GET", p: "/v1/usage", d: "Usage summary", c: "Free" },
                { m: "GET", p: "/v1/sessions", d: "List active sessions", c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-40 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-12 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════ Errors ════ */}
      <div className="py-8 mb-6">
        <Section id="errors" title="Error Handling" icon={Eye} description="All errors return a JSON body with error.code and error.message fields.">
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden divide-y divide-foreground/[0.04]">
            {[
              { code: "401", name: "INVALID_API_KEY", desc: "Missing or invalid X-API-Key" },
              { code: "402", name: "INSUFFICIENT_CREDITS", desc: "Not enough credits for this request" },
              { code: "403", name: "INSUFFICIENT_SCOPE", desc: "API key lacks the required scope" },
              { code: "429", name: "RATE_LIMIT_EXCEEDED", desc: "Too many requests — check Retry-After header" },
              { code: "400", name: "INVALID_SCREENSHOT", desc: "Bad base64 or unsupported image format" },
              { code: "404", name: "SESSION_NOT_FOUND", desc: "Session expired or does not exist" },
            ].map(row => (
              <div key={row.name} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-[11px] font-mono font-bold text-muted-foreground/35 w-8 shrink-0">{row.code}</span>
                <code className="text-[11px] font-mono text-foreground/60 w-48 shrink-0 truncate">{row.name}</code>
                <span className="text-[12px] text-muted-foreground/45 flex-1">{row.desc}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

        </div>
      </div>

    </motion.div>
  )
}
