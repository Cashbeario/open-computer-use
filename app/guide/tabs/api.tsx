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

/* ─── machines API snippets ─── */
//
// Three flagship operations (provision / action / terminal) per language.
// Bodies validated against the strict Pydantic models in
// backend/app/models/public_machines.py — extra="forbid" rejects typos.
// Every example here passes that validation.

type MachinesSnippet = { provision: string; action: string; terminal: string }

const MACHINES_SNIPPETS: Record<LangId, MachinesSnippet> = {
  python: {
    provision: `import requests

# Provision a fresh Linux desktop VM. Sandbox keys (sk-coasty-test-*)
# return a mock machine instantly with no AWS billing.
r = requests.post(
    "https://coasty.ai/v1/machines",
    headers={
        "X-API-Key": "sk-coasty-live-...",
        "Idempotency-Key": "provision-bot-001",   # safe to retry
    },
    json={
        "display_name": "automation-bot",
        "os_type": "linux",
        "desktop_enabled": True,
    },
)
machine = r.json()["machine"]
print(machine["id"], machine["status"])`,
    action: `import requests

machine_id = "..."  # from provision response
r = requests.post(
    f"https://coasty.ai/v1/machines/{machine_id}/actions",
    headers={"X-API-Key": "sk-coasty-live-..."},
    json={
        "command": "click",
        "parameters": {"x": 512, "y": 340},
    },
)
result = r.json()
print(result["success"], result["duration_ms"], "ms")`,
    terminal: `import requests

# Run a shell command (PowerShell on Windows, bash on Linux).
# Output is truncated VM-side to 5000 chars.
r = requests.post(
    f"https://coasty.ai/v1/machines/{machine_id}/terminal",
    headers={"X-API-Key": "sk-coasty-live-..."},
    json={
        "command": "uname -a && uptime",
        "timeout_ms": 10_000,
    },
)
print(r.json()["result"]["output"])`,
  },
  javascript: {
    provision: `// Node 18+ (global fetch). Use \`Idempotency-Key\` to safely retry on network errors.
const res = await fetch("https://coasty.ai/v1/machines", {
  method: "POST",
  headers: {
    "X-API-Key": "sk-coasty-live-...",
    "Content-Type": "application/json",
    "Idempotency-Key": "provision-bot-001",
  },
  body: JSON.stringify({
    display_name: "automation-bot",
    os_type: "linux",
    desktop_enabled: true,
  }),
})
const { machine } = await res.json()
console.log(machine.id, machine.status)`,
    action: `const res = await fetch(
  \`https://coasty.ai/v1/machines/\${machineId}/actions\`,
  {
    method: "POST",
    headers: {
      "X-API-Key": "sk-coasty-live-...",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      command: "click",
      parameters: { x: 512, y: 340 },
    }),
  },
)
const { success, duration_ms } = await res.json()
console.log(success, duration_ms, "ms")`,
    terminal: `const res = await fetch(
  \`https://coasty.ai/v1/machines/\${machineId}/terminal\`,
  {
    method: "POST",
    headers: {
      "X-API-Key": "sk-coasty-live-...",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      command: "uname -a && uptime",
      timeout_ms: 10000,
    }),
  },
)
const { result } = await res.json()
console.log(result.output)`,
  },
  go: {
    provision: `package main

import (
  "bytes"
  "encoding/json"
  "net/http"
)

type provisionReq struct {
  DisplayName    string \`json:"display_name"\`
  OSType         string \`json:"os_type"\`
  DesktopEnabled bool   \`json:"desktop_enabled"\`
}

func main() {
  body, _ := json.Marshal(provisionReq{
    DisplayName:    "automation-bot",
    OSType:         "linux",
    DesktopEnabled: true,
  })

  req, _ := http.NewRequest("POST",
    "https://coasty.ai/v1/machines",
    bytes.NewReader(body))
  req.Header.Set("X-API-Key", "sk-coasty-live-...")
  req.Header.Set("Content-Type", "application/json")
  req.Header.Set("Idempotency-Key", "provision-bot-001")

  resp, _ := http.DefaultClient.Do(req)
  defer resp.Body.Close()
}`,
    action: `body, _ := json.Marshal(map[string]any{
  "command": "click",
  "parameters": map[string]int{"x": 512, "y": 340},
})

req, _ := http.NewRequest("POST",
  fmt.Sprintf("https://coasty.ai/v1/machines/%s/actions", machineID),
  bytes.NewReader(body))
req.Header.Set("X-API-Key", "sk-coasty-live-...")
req.Header.Set("Content-Type", "application/json")

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()`,
    terminal: `body, _ := json.Marshal(map[string]any{
  "command":    "uname -a && uptime",
  "timeout_ms": 10000,
})

req, _ := http.NewRequest("POST",
  fmt.Sprintf("https://coasty.ai/v1/machines/%s/terminal", machineID),
  bytes.NewReader(body))
req.Header.Set("X-API-Key", "sk-coasty-live-...")
req.Header.Set("Content-Type", "application/json")

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()`,
  },
  curl: {
    provision: `curl -X POST https://coasty.ai/v1/machines \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: provision-bot-001" \\
  -d '{
    "display_name": "automation-bot",
    "os_type": "linux",
    "desktop_enabled": true
  }'`,
    action: `curl -X POST https://coasty.ai/v1/machines/$MACHINE_ID/actions \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "command": "click",
    "parameters": {"x": 512, "y": 340}
  }'`,
    terminal: `curl -X POST https://coasty.ai/v1/machines/$MACHINE_ID/terminal \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "command": "uname -a && uptime",
    "timeout_ms": 10000
  }'`,
  },
  ruby: {
    provision: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/machines")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"]        = "sk-coasty-live-..."
req["Content-Type"]     = "application/json"
req["Idempotency-Key"]  = "provision-bot-001"
req.body = {
  display_name: "automation-bot",
  os_type: "linux",
  desktop_enabled: true,
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
machine = JSON.parse(res.body)["machine"]
puts machine["id"]`,
    action: `req = Net::HTTP::Post.new(
  URI("https://coasty.ai/v1/machines/#{machine_id}/actions")
)
req["X-API-Key"]    = "sk-coasty-live-..."
req["Content-Type"] = "application/json"
req.body = { command: "click", parameters: { x: 512, y: 340 } }.to_json
# ... send & read result`,
    terminal: `req.body = {
  command: "uname -a && uptime",
  timeout_ms: 10_000,
}.to_json
# POST to /v1/machines/<id>/terminal — same auth headers as above`,
  },
  php: {
    provision: `<?php
$ch = curl_init("https://coasty.ai/v1/machines");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: sk-coasty-live-...",
    "Content-Type: application/json",
    "Idempotency-Key: provision-bot-001",
  ],
  CURLOPT_POSTFIELDS     => json_encode([
    "display_name"    => "automation-bot",
    "os_type"         => "linux",
    "desktop_enabled" => true,
  ]),
]);
$body = json_decode(curl_exec($ch), true);
echo $body["machine"]["id"];`,
    action: `// POST to /v1/machines/{id}/actions with the same auth headers,
// body: {"command": "click", "parameters": {"x": 512, "y": 340}}`,
    terminal: `// POST to /v1/machines/{id}/terminal,
// body: {"command": "uname -a", "timeout_ms": 10000}`,
  },
  java: {
    provision: `import java.net.URI;
import java.net.http.*;

var body = """
  {
    "display_name": "automation-bot",
    "os_type": "linux",
    "desktop_enabled": true
  }""";

var req = HttpRequest.newBuilder()
    .uri(URI.create("https://coasty.ai/v1/machines"))
    .header("X-API-Key", "sk-coasty-live-...")
    .header("Content-Type", "application/json")
    .header("Idempotency-Key", "provision-bot-001")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();

var resp = HttpClient.newHttpClient()
    .send(req, HttpResponse.BodyHandlers.ofString());
System.out.println(resp.body());`,
    action: `// POST /v1/machines/{id}/actions
// Body: {"command": "click", "parameters": {"x": 512, "y": 340}}`,
    terminal: `// POST /v1/machines/{id}/terminal
// Body: {"command": "uname -a", "timeout_ms": 10000}`,
  },
  csharp: {
    provision: `using System.Net.Http.Json;

var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-API-Key", "sk-coasty-live-...");
http.DefaultRequestHeaders.Add("Idempotency-Key", "provision-bot-001");

var resp = await http.PostAsJsonAsync(
    "https://coasty.ai/v1/machines",
    new {
        display_name    = "automation-bot",
        os_type         = "linux",
        desktop_enabled = true,
    }
);
var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine(body.GetProperty("machine").GetProperty("id"));`,
    action: `// POST /v1/machines/{id}/actions
// Body: { command = "click", parameters = new { x = 512, y = 340 } }`,
    terminal: `// POST /v1/machines/{id}/terminal
// Body: { command = "uname -a", timeout_ms = 10000 }`,
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

type DocSection = {
  id: string
  title: string
  icon: PhosphorIcon
  group: "Start" | "Predict" | "Machines" | "Errors"
}

const DOC_SECTIONS: DocSection[] = [
  // ── Getting Started ──
  { id: "authentication",       title: "Authentication",         icon: Key,           group: "Start" },
  { id: "how-it-works",         title: "How it Works",           icon: CursorClick,   group: "Start" },
  { id: "quickstart",           title: "Quick Start",            icon: Lightning,     group: "Start" },

  // ── Predict API (the screenshot-to-actions surface) ──
  { id: "response",             title: "Response Format",        icon: BracketsAngle, group: "Predict" },
  { id: "actions",              title: "Action Types",           icon: CursorClick,   group: "Predict" },
  { id: "options",              title: "Request Options",        icon: Textbox,       group: "Predict" },
  { id: "endpoints",            title: "Predict Endpoints",      icon: Terminal,      group: "Predict" },

  // ── Machines API (the new managed-VM surface) ──
  { id: "machines-overview",    title: "Overview & Scopes",      icon: Plugs,         group: "Machines" },
  { id: "machines-provision",   title: "Provision & Lifecycle",  icon: Lightning,     group: "Machines" },
  { id: "machines-actions",     title: "Actions & Batches",      icon: CursorClick,   group: "Machines" },
  { id: "machines-subapi",      title: "Browser, Terminal, Files", icon: Terminal,    group: "Machines" },
  { id: "machines-endpoints",   title: "Machines Endpoints",     icon: ListBullets,   group: "Machines" },

  // ── Errors ──
  { id: "errors",               title: "Error Handling",         icon: Eye,           group: "Errors" },
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

      {/* ════ Predict Endpoints ════ */}
      <div className="py-8 mb-8">
        <Section id="endpoints" title="Predict Endpoints" icon={Terminal} description="Stateless prediction, sessions, and grounding utilities. All require the X-API-Key header.">
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

      {/* ════════════════════════════════════════════════════════════════════
           ═════════════════ MACHINES API ═════════════════
           Managed VM provisioning, action dispatch, browser/terminal/files.
           Each section below uses the SAME `lang` from Quick Start so the
           reader can pick a language once and see consistent examples.
           ════════════════════════════════════════════════════════════════════ */}

      {/* ─── Machines: Overview & Scopes ─── */}
      <div className="py-8 mb-8">
        <Section
          id="machines-overview"
          title="Machines API"
          icon={Plugs}
          description="Provision a sandbox or production VM, then drive it with actions, terminal commands, browser automation, or file operations. Sandbox keys (sk-coasty-test-*) return mock VMs with no AWS billing."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scopes card */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Scopes</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { s: "machines:read",     d: "list, get, screenshot" },
                  { s: "machines:write",    d: "provision, start, stop, terminate" },
                  { s: "actions:exec",      d: "click, type, scroll, browser_*" },
                  { s: "terminal:exec",     d: "shell command execution" },
                  { s: "files:read",        d: "read, exists, list" },
                  { s: "files:write",       d: "write, edit, append, delete" },
                  { s: "browser:execute",   d: "arbitrary JS in browser" },
                  { s: "snapshots:write",   d: "create AMI snapshots" },
                  { s: "connection:read",   d: "fetch SSH key + VNC password" },
                ].map(row => (
                  <div key={row.s} className="flex items-center gap-3 px-5 py-2.5">
                    <code className="text-[11px] font-mono font-semibold text-foreground/65 w-32 shrink-0 truncate">{row.s}</code>
                    <span className="text-[11px] text-muted-foreground/45 flex-1 truncate">{row.d}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing card */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Pricing</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { r: "Provision (any provider)",       c: "20 cr min" },
                  { r: "Agent run on managed VM",         c: "10 cr/min" },
                  { r: "Raw VM-hour (Linux)",             c: "50 cr/hr" },
                  { r: "Raw VM-hour (Windows)",           c: "75 cr/hr" },
                  { r: "Idle VM (provisioned, unused)",   c: "5 cr/hr" },
                  { r: "Snapshot create",                 c: "1 cr" },
                  { r: "Snapshot storage",                c: "1 cr / 2 GB-mo" },
                  { r: "Egress (after first 10 GB/mo)",   c: "1 cr/GB" },
                  { r: "Sandbox (sk-coasty-test-*)",      c: "Free" },
                ].map(row => (
                  <div key={row.r} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-[11px] text-muted-foreground/55 flex-1 truncate">{row.r}</span>
                    <code className="text-[10px] font-mono text-foreground/55 shrink-0">{row.c}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider shrink-0 mt-0.5">Tip</span>
              <span className="text-[12px] text-muted-foreground/55 leading-relaxed">
                Use a <code className="text-[11px] font-mono text-foreground/65">sk-coasty-test-*</code> key during development —
                you get instant mock VMs (id <code className="text-[11px] font-mono text-foreground/65">mch_test_…</code>),
                synthetic action results, and zero billing. The wire format matches production exactly,
                so you can swap to a live key and ship.
              </span>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Machines: Provision & Lifecycle ─── */}
      <div className="py-8 mb-8">
        <Section
          id="machines-provision"
          title="Provision & Lifecycle"
          icon={Lightning}
          description="Create a VM, list your fleet, and control start/stop/snapshot/terminate. Sandbox keys mock everything in-memory; live keys provision real EC2 / Azure instances."
        >
          <GuideCodeBlock label={`provision a vm — ${lang}`} code={MACHINES_SNIPPETS[lang].provision} />

          <div className="mt-5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Lifecycle</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "GET",    p: "/v1/machines",                d: "List your machines" },
                { m: "GET",    p: "/v1/machines/{id}",           d: "Get a machine" },
                { m: "POST",   p: "/v1/machines/{id}/start",     d: "Start a stopped VM" },
                { m: "POST",   p: "/v1/machines/{id}/stop",      d: "Stop a running VM" },
                { m: "POST",   p: "/v1/machines/{id}/snapshot",  d: "Create AMI snapshot" },
                { m: "DELETE", p: "/v1/machines/{id}",           d: "Terminate (irreversible)" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                                         "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-44 truncate">{row.d}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Machines: Actions & Batches ─── */}
      <div className="py-8 mb-8">
        <Section
          id="machines-actions"
          title="Actions & Batches"
          icon={CursorClick}
          description="Dispatch a single action, or chain up to 50 in one batch. Commands are validated against an explicit allowlist — typos return 422, never reach the VM."
        >
          <GuideCodeBlock label={`single action — ${lang}`} code={MACHINES_SNIPPETS[lang].action} />

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Allowed commands table */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Common Commands</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { c: "click",            p: "{ x, y, button? }",              s: "actions:exec" },
                  { c: "type",             p: "{ text }",                        s: "actions:exec" },
                  { c: "key_press",        p: '{ key: "enter" }',                s: "actions:exec" },
                  { c: "key_combo",        p: '{ keys: ["ctrl","c"] }',          s: "actions:exec" },
                  { c: "scroll",           p: "{ x, y, direction, clicks }",    s: "actions:exec" },
                  { c: "drag",             p: "{ x1, y1, x2, y2 }",              s: "actions:exec" },
                  { c: "screenshot",       p: "{ }",                              s: "actions:exec" },
                  { c: "terminal_execute", p: "{ command, timeout? }",            s: "terminal:exec" },
                  { c: "file_read",        p: "{ path }",                         s: "files:read" },
                  { c: "file_write",       p: "{ path, content }",                s: "files:write" },
                  { c: "browser_navigate", p: "{ url }",                          s: "actions:exec" },
                  { c: "browser_click",    p: "{ selector | x,y | text }",        s: "actions:exec" },
                  { c: "browser_execute",  p: '{ code: "..." }',                  s: "browser:execute" },
                ].map(row => (
                  <div key={row.c} className="flex items-center gap-3 px-5 py-2.5">
                    <code className="text-[11px] font-mono font-semibold text-foreground/65 w-32 shrink-0 truncate">{row.c}</code>
                    <code className="text-[10px] font-mono text-muted-foreground/35 flex-1 truncate hidden md:block">{row.p}</code>
                    <code className="text-[10px] font-mono text-amber-600/55 dark:text-amber-400/55 shrink-0">{row.s}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Batch shape */}
            <GuideCodeBlock
              label="batch action — request body"
              code={`POST /v1/machines/{id}/actions/batch
Content-Type: application/json
X-API-Key: sk-coasty-live-...

{
  "steps": [
    { "command": "browser_navigate",
      "parameters": { "url": "https://example.com/login" } },
    { "command": "browser_type",
      "parameters": { "selector": "#email", "text": "you@me.com" } },
    { "command": "browser_type",
      "parameters": { "selector": "#password", "text": "***" } },
    { "command": "browser_click",
      "parameters": { "selector": "button[type=submit]" } }
  ],
  "stop_on_error": true
}

Returns:
{
  "results": [...],         // one per step
  "completed_count": 4,
  "failed_count": 0,
  "aborted": false,
  "request_id": "req_..."
}`}
            />
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Machines: Browser, Terminal, Files sub-APIs ─── */}
      <div className="py-8 mb-8">
        <Section
          id="machines-subapi"
          title="Browser, Terminal, Files"
          icon={Terminal}
          description="Typed convenience endpoints over /actions. Same dispatch path, ergonomic URL shapes, identical scope rules."
        >
          <GuideCodeBlock label={`shell command — ${lang}`} code={MACHINES_SNIPPETS[lang].terminal} />

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Browser sub-ops */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">/browser/{"{op}"}</code>
              </div>
              <div className="px-5 py-3">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {[
                    "open", "navigate", "click", "type",
                    "dom", "clickables", "state", "info",
                    "scroll", "close", "screenshot", "wait",
                    "list-tabs", "open-tab", "close-tab", "switch-tab",
                  ].map(op => (
                    <code key={op} className="text-[10px] font-mono text-foreground/55 truncate">{op}</code>
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground/35 leading-relaxed">
                  Body: <code className="text-[10px] font-mono">{"{ parameters: {…}, timeout_ms? }"}</code>.
                  <code className="text-[10px] font-mono"> browser_execute</code> NOT here — use /actions with browser:execute.
                </p>
              </div>
            </div>

            {/* Files sub-ops */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">/files/{"{op}"}</code>
              </div>
              <div className="px-5 py-3">
                <div className="space-y-1.5">
                  <div className="text-[9px] font-semibold text-muted-foreground/35 uppercase tracking-wider mb-1">Read (files:read)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["read", "exists", "list", "list-directory", "download", "list-downloads"].map(op => (
                      <code key={op} className="text-[10px] font-mono text-foreground/55 px-1.5 py-0.5 rounded bg-foreground/[0.025]">{op}</code>
                    ))}
                  </div>
                  <div className="text-[9px] font-semibold text-muted-foreground/35 uppercase tracking-wider mt-3 mb-1">Write (files:write)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["write", "edit", "append", "delete", "delete-directory"].map(op => (
                      <code key={op} className="text-[10px] font-mono text-foreground/55 px-1.5 py-0.5 rounded bg-foreground/[0.025]">{op}</code>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Terminal */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">/terminal</code>
              </div>
              <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed">
                Body: <code className="text-[10px] font-mono">{"{ command, timeout_ms?, session_id?, cwd? }"}</code>
                <span className="block mt-2">
                  PowerShell on Windows, bash on Unix. Output capped at 5000 chars VM-side. Pass
                  <code className="text-[10px] font-mono"> session_id</code> to reuse a persistent shell across calls.
                </span>
                <span className="block mt-2 text-amber-600/65 dark:text-amber-400/65">Requires <code className="text-[10px] font-mono">terminal:exec</code> scope.</span>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Machines: Endpoint reference ─── */}
      <div className="py-8 mb-8">
        <Section
          id="machines-endpoints"
          title="Machines Endpoints"
          icon={ListBullets}
          description="Full reference. All require X-API-Key (or Authorization: Bearer) except /health."
        >
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            {/* Group: Lifecycle */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Lifecycle</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST",   p: "/v1/machines",                  d: "Provision a new VM",       c: "20 cr min" },
                { m: "GET",    p: "/v1/machines",                  d: "List machines",             c: "Free" },
                { m: "GET",    p: "/v1/machines/{id}",             d: "Get a machine",             c: "Free" },
                { m: "DELETE", p: "/v1/machines/{id}",             d: "Terminate (irreversible)",  c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/start",       d: "Start stopped VM",          c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/stop",        d: "Stop running VM",           c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/snapshot",    d: "Create AMI snapshot",       c: "1 cr" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                                         "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-48 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-16 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* Group: Actions */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Actions</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST", p: "/v1/machines/{id}/actions",        d: "Single action",            c: "Free" },
                { m: "POST", p: "/v1/machines/{id}/actions/batch",  d: "≤ 50 actions",             c: "Free" },
                { m: "POST", p: "/v1/machines/{id}/browser/{op}",   d: "Browser convenience",       c: "Free" },
                { m: "POST", p: "/v1/machines/{id}/terminal",       d: "Shell command",             c: "Free" },
                { m: "POST", p: "/v1/machines/{id}/files/{op}",     d: "File ops",                  c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-48 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-16 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* Group: Inspection */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Inspection</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "GET", p: "/v1/machines/{id}/screenshot", d: "Capture a screenshot",            c: "Free" },
                { m: "GET", p: "/v1/machines/{id}/connection", d: "SSH key + VNC pwd (HIGH-RISK)",   c: "Free" },
                { m: "GET", p: "/v1/machines/health",          d: "Public health probe",              c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-48 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-16 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════ Errors ════ */}
      <div className="py-8 mb-6">
        <Section id="errors" title="Error Handling" icon={Eye} description="All errors return a JSON body with error.code, error.message, error.type, and error.request_id fields.">
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden divide-y divide-foreground/[0.04]">
            {[
              { code: "400", name: "INVALID_MACHINE_ID",    desc: "Path id is not a UUID or mch_test_<hex>" },
              { code: "400", name: "INVALID_IDEMPOTENCY_KEY", desc: "Idempotency-Key has bad chars or > 128 chars" },
              { code: "400", name: "UNKNOWN_BROWSER_OP",    desc: "Unknown {op} in /browser/{op}" },
              { code: "400", name: "UNKNOWN_FILE_OP",       desc: "Unknown {op} in /files/{op}" },
              { code: "401", name: "INVALID_API_KEY",       desc: "Missing or invalid X-API-Key / Bearer token" },
              { code: "402", name: "INSUFFICIENT_CREDITS",  desc: "Balance below required amount (provision needs ≥ 20 cr)" },
              { code: "403", name: "INSUFFICIENT_SCOPE",    desc: "API key lacks the required scope for this op" },
              { code: "404", name: "NOT_FOUND",             desc: "Machine/session not found OR not owned by your key" },
              { code: "409", name: "INVALID_STATE",         desc: "Action requires status='running'; lifecycle has illegal transition" },
              { code: "422", name: "IDEMPOTENCY_KEY_REUSED", desc: "Same Idempotency-Key sent with a different request body" },
              { code: "422", name: "VALIDATION_ERROR",      desc: "Body fails Pydantic — unknown field, wrong type, oversize, bad command" },
              { code: "429", name: "RATE_LIMIT_EXCEEDED",   desc: "Too many requests — see Retry-After header" },
              { code: "429", name: "TEST_MACHINE_LIMIT",    desc: "Sandbox keys are capped at 5 mock VMs" },
              { code: "502", name: "SCREENSHOT_FAILED",     desc: "Screenshot dispatch reached the VM but capture errored" },
              { code: "503", name: "DB_UNAVAILABLE",        desc: "Backend cannot reach Supabase" },
              { code: "504", name: "UPSTREAM_TIMEOUT",      desc: "Provision proxy timed out (try Idempotency-Key + retry)" },
            ].map((row, i) => (
              <div key={`${row.name}-${i}`} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-[11px] font-mono font-bold text-muted-foreground/35 w-8 shrink-0">{row.code}</span>
                <code className="text-[11px] font-mono text-foreground/60 w-52 shrink-0 truncate">{row.name}</code>
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
