"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
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
  CaretRight,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import {
  ACTION_EXECUTOR_MAP,
  COORDINATE_SCALING_NOTE,
  LOCAL_AUTOMATION_SNIPPETS,
  LOCAL_SAFETY_NOTE,
  PROMPT_PRESETS,
  type LocalAutomationLang,
} from "@/lib/local-automation"

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
    "desktop_enabled": true,
    "ttl_minutes": 240
  }'
# ttl_minutes (optional, 5–10080): auto-destroy lease. Extend/clear later:
#   curl -X PATCH https://coasty.ai/v1/machines/$MACHINE_ID \\
#     -H "X-API-Key: ..." -d '{"ttl_minutes": 480}'   # or 0 to clear`,
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

/* ─── schedules API snippets ─── */
//
// Bodies validated by backend/tests/test_doc_examples.py against the strict
// Pydantic models (extra="forbid"). Webhook signing math is roundtrip-tested
// against the actual verifier in test_public_schedules.py — copy any snippet
// here and it produces a Coasty-Signature the verifier accepts.

type SchedulesSnippet = { create: string; trigger: string; signing: string }

const SCHEDULES_SNIPPETS: Record<LangId, SchedulesSnippet> = {
  python: {
    create: `import requests

# Daily 9:00 AM ET email summary, fired by the Coasty scheduler.
# Per fire: needs >= 20 cr ($0.20) in your API wallet to dispatch (gate only);
# agent runtime then bills your Coasty credit balance at 10 credits/min.
r = requests.post(
    "https://coasty.ai/v1/schedules",
    headers={
        "X-API-Key": "sk-coasty-live-...",
        "Idempotency-Key": "morning-briefing-001",
    },
    json={
        "name": "morning briefing",
        "machine_id": "550e8400-e29b-41d4-a716-446655440000",
        "task_prompt": "Summarize unread Gmail and post the top 5 to Slack.",
        "frequency": "daily",
        "time": "09:00",
        "timezone": "America/New_York",
    },
)
schedule = r.json()
print(schedule["id"], schedule["next_run_at"])`,
    trigger: `# Add a webhook trigger — returns the signing secret ONCE.
r = requests.post(
    f"https://coasty.ai/v1/schedules/{schedule_id}/triggers",
    headers={"X-API-Key": "sk-coasty-live-..."},
    json={"kind": "webhook", "rate_limit_per_minute": 60},
)
trigger = r.json()
webhook_url    = trigger["webhook_url"]      # https://coasty.ai/v1/triggers/webhook/whk_...
webhook_secret = trigger["webhook_secret"]   # whsec_<64 hex>  — STORE THIS

# Save webhook_secret in your secrets manager. We hash + persist it; we
# cannot show it again. Lose it = generate a new trigger.`,
    signing: `# Customer-side webhook signing — produces a Coasty-Signature header
# the public /v1/triggers/webhook/{id} endpoint accepts.
import hmac, hashlib, time

def sign_coasty_webhook(secret: str, body: bytes) -> dict:
    ts = int(time.time())
    signed_payload = f"{ts}.".encode("utf-8") + body
    sig = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return {"Coasty-Signature": f"t={ts},v1={sig}"}

# Fire the webhook from your own app:
import requests
body = b'{"event":"order.placed","order_id":"123"}'
headers = {**sign_coasty_webhook(webhook_secret, body), "Content-Type": "application/json"}
requests.post(webhook_url, data=body, headers=headers)`,
  },
  javascript: {
    create: `// Node 18+. Runs at 09:00 America/New_York every day.
const res = await fetch("https://coasty.ai/v1/schedules", {
  method: "POST",
  headers: {
    "X-API-Key": "sk-coasty-live-...",
    "Content-Type": "application/json",
    "Idempotency-Key": "morning-briefing-001",
  },
  body: JSON.stringify({
    name: "morning briefing",
    machine_id: "550e8400-e29b-41d4-a716-446655440000",
    task_prompt: "Summarize unread Gmail and post the top 5 to Slack.",
    frequency: "daily",
    time: "09:00",
    timezone: "America/New_York",
  }),
})
const schedule = await res.json()
console.log(schedule.id, schedule.next_run_at)`,
    trigger: `const res = await fetch(
  \`https://coasty.ai/v1/schedules/\${scheduleId}/triggers\`,
  {
    method: "POST",
    headers: {
      "X-API-Key": "sk-coasty-live-...",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ kind: "webhook", rate_limit_per_minute: 60 }),
  },
)
const trigger = await res.json()
const webhookUrl    = trigger.webhook_url       // https://coasty.ai/v1/triggers/webhook/whk_...
const webhookSecret = trigger.webhook_secret    // whsec_<64 hex> — STORE THIS

// Save webhook_secret in your secrets manager — we cannot show it again.`,
    signing: `// Customer-side webhook signing — Node 18+ (built-in crypto).
import { createHmac } from "node:crypto"

function signCoastyWebhook(secret, body) {
  const ts = Math.floor(Date.now() / 1000)
  const payload = Buffer.concat([Buffer.from(\`\${ts}.\`, "utf-8"), body])
  const sig = createHmac("sha256", secret).update(payload).digest("hex")
  return { "Coasty-Signature": \`t=\${ts},v1=\${sig}\` }
}

const body = Buffer.from('{"event":"order.placed","order_id":"123"}')
const headers = {
  ...signCoastyWebhook(webhookSecret, body),
  "Content-Type": "application/json",
}
await fetch(webhookUrl, { method: "POST", headers, body })`,
  },
  go: {
    create: `package main

import (
  "bytes"
  "encoding/json"
  "net/http"
)

type req struct {
  Name        string \`json:"name"\`
  MachineID   string \`json:"machine_id"\`
  TaskPrompt  string \`json:"task_prompt"\`
  Frequency   string \`json:"frequency"\`
  Time        string \`json:"time"\`
  Timezone    string \`json:"timezone"\`
}

func main() {
  body, _ := json.Marshal(req{
    Name:       "morning briefing",
    MachineID:  "550e8400-e29b-41d4-a716-446655440000",
    TaskPrompt: "Summarize unread Gmail and post the top 5 to Slack.",
    Frequency:  "daily",
    Time:       "09:00",
    Timezone:   "America/New_York",
  })

  r, _ := http.NewRequest("POST",
    "https://coasty.ai/v1/schedules",
    bytes.NewReader(body))
  r.Header.Set("X-API-Key", "sk-coasty-live-...")
  r.Header.Set("Content-Type", "application/json")
  r.Header.Set("Idempotency-Key", "morning-briefing-001")

  resp, _ := http.DefaultClient.Do(r)
  defer resp.Body.Close()
}`,
    trigger: `body, _ := json.Marshal(map[string]any{
  "kind": "webhook",
  "rate_limit_per_minute": 60,
})
r, _ := http.NewRequest("POST",
  fmt.Sprintf("https://coasty.ai/v1/schedules/%s/triggers", scheduleID),
  bytes.NewReader(body))
r.Header.Set("X-API-Key", "sk-coasty-live-...")
r.Header.Set("Content-Type", "application/json")
resp, _ := http.DefaultClient.Do(r)

// Parse resp.Body for { "webhook_url": "...", "webhook_secret": "whsec_..." }
// and store the secret in your vault — it is not shown again.`,
    signing: `package coasty

import (
  "crypto/hmac"
  "crypto/sha256"
  "encoding/hex"
  "fmt"
  "time"
)

func SignCoastyWebhook(secret string, body []byte) (header string) {
  ts := time.Now().Unix()
  payload := append([]byte(fmt.Sprintf("%d.", ts)), body...)
  h := hmac.New(sha256.New, []byte(secret))
  h.Write(payload)
  sig := hex.EncodeToString(h.Sum(nil))
  return fmt.Sprintf("t=%d,v1=%s", ts, sig)
}

// Usage:
// header := SignCoastyWebhook(webhookSecret, body)
// req.Header.Set("Coasty-Signature", header)`,
  },
  curl: {
    create: `curl -X POST https://coasty.ai/v1/schedules \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: morning-briefing-001" \\
  -d '{
    "name": "morning briefing",
    "machine_id": "550e8400-e29b-41d4-a716-446655440000",
    "task_prompt": "Summarize unread Gmail and post the top 5 to Slack.",
    "frequency": "daily",
    "time": "09:00",
    "timezone": "America/New_York"
  }'`,
    trigger: `curl -X POST https://coasty.ai/v1/schedules/$SCHEDULE_ID/triggers \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{"kind":"webhook","rate_limit_per_minute":60}'

# Response:
# {
#   "id": "trg_...",
#   "kind": "webhook",
#   "webhook_url":    "https://coasty.ai/v1/triggers/webhook/whk_...",
#   "webhook_secret": "whsec_<64 hex>"   <- store this; not returned again
# }`,
    signing: `# Bash signing helper. SECRET = whsec_<64 hex> from trigger creation.
SECRET="whsec_..."
BODY='{"event":"order.placed","order_id":"123"}'
TS=$(date +%s)

SIG=$(printf '%s.%s' "$TS" "$BODY" | \\
      openssl dgst -sha256 -hmac "$SECRET" -hex | \\
      awk '{print $2}')

curl -X POST "$WEBHOOK_URL" \\
  -H "Coasty-Signature: t=$TS,v1=$SIG" \\
  -H "Content-Type: application/json" \\
  --data "$BODY"`,
  },
  ruby: {
    create: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/schedules")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"]       = "sk-coasty-live-..."
req["Content-Type"]    = "application/json"
req["Idempotency-Key"] = "morning-briefing-001"
req.body = {
  name: "morning briefing",
  machine_id: "550e8400-e29b-41d4-a716-446655440000",
  task_prompt: "Summarize unread Gmail and post the top 5 to Slack.",
  frequency: "daily",
  time: "09:00",
  timezone: "America/New_York",
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
puts JSON.parse(res.body)["id"]`,
    trigger: `# POST /v1/schedules/{id}/triggers with body { kind: "webhook" }
# Response includes \`webhook_url\` and \`webhook_secret\` — store the secret.`,
    signing: `require "openssl"

def sign_coasty_webhook(secret, body)
  ts = Time.now.to_i
  payload = "#{ts}.".b + body
  sig = OpenSSL::HMAC.hexdigest("sha256", secret, payload)
  "t=#{ts},v1=#{sig}"
end

# headers["Coasty-Signature"] = sign_coasty_webhook(webhook_secret, body)`,
  },
  php: {
    create: `<?php
$ch = curl_init("https://coasty.ai/v1/schedules");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: sk-coasty-live-...",
    "Content-Type: application/json",
    "Idempotency-Key: morning-briefing-001",
  ],
  CURLOPT_POSTFIELDS     => json_encode([
    "name"        => "morning briefing",
    "machine_id"  => "550e8400-e29b-41d4-a716-446655440000",
    "task_prompt" => "Summarize unread Gmail and post the top 5 to Slack.",
    "frequency"   => "daily",
    "time"        => "09:00",
    "timezone"    => "America/New_York",
  ]),
]);
$body = json_decode(curl_exec($ch), true);
echo $body["id"];`,
    trigger: `// POST /v1/schedules/{id}/triggers with body {kind: "webhook"}
// Response: { webhook_url, webhook_secret } — store the secret.`,
    signing: `<?php
function sign_coasty_webhook($secret, $body) {
  $ts = time();
  $payload = $ts . "." . $body;
  $sig = hash_hmac("sha256", $payload, $secret);
  return "t={$ts},v1={$sig}";
}
?>`,
  },
  java: {
    create: `import java.net.URI;
import java.net.http.*;

var body = """
  {
    "name": "morning briefing",
    "machine_id": "550e8400-e29b-41d4-a716-446655440000",
    "task_prompt": "Summarize unread Gmail and post the top 5 to Slack.",
    "frequency": "daily",
    "time": "09:00",
    "timezone": "America/New_York"
  }""";

var req = HttpRequest.newBuilder()
    .uri(URI.create("https://coasty.ai/v1/schedules"))
    .header("X-API-Key", "sk-coasty-live-...")
    .header("Content-Type", "application/json")
    .header("Idempotency-Key", "morning-briefing-001")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();

HttpClient.newHttpClient()
    .send(req, HttpResponse.BodyHandlers.ofString());`,
    trigger: `// POST /v1/schedules/{id}/triggers with { "kind": "webhook" }
// Parse webhook_url + webhook_secret from response; store the secret.`,
    signing: `import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

static String signCoastyWebhook(String secret, byte[] body) throws Exception {
  long ts = System.currentTimeMillis() / 1000;
  byte[] payload = (ts + ".").getBytes(StandardCharsets.UTF_8);
  byte[] full = new byte[payload.length + body.length];
  System.arraycopy(payload, 0, full, 0, payload.length);
  System.arraycopy(body, 0, full, payload.length, body.length);

  var mac = Mac.getInstance("HmacSHA256");
  mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
  byte[] raw = mac.doFinal(full);
  StringBuilder hex = new StringBuilder();
  for (byte b : raw) hex.append(String.format("%02x", b));
  return "t=" + ts + ",v1=" + hex;
}`,
  },
  csharp: {
    create: `using System.Net.Http.Json;

var http = new HttpClient();
http.DefaultRequestHeaders.Add("X-API-Key", "sk-coasty-live-...");
http.DefaultRequestHeaders.Add("Idempotency-Key", "morning-briefing-001");

var resp = await http.PostAsJsonAsync(
    "https://coasty.ai/v1/schedules",
    new {
        name = "morning briefing",
        machine_id = "550e8400-e29b-41d4-a716-446655440000",
        task_prompt = "Summarize unread Gmail and post the top 5 to Slack.",
        frequency = "daily",
        time = "09:00",
        timezone = "America/New_York",
    }
);
var body = await resp.Content.ReadFromJsonAsync<JsonElement>();
Console.WriteLine(body.GetProperty("id"));`,
    trigger: `// POST /v1/schedules/{id}/triggers with { kind = "webhook" }
// Response carries webhook_url and webhook_secret — save the secret.`,
    signing: `using System.Security.Cryptography;
using System.Text;

static string SignCoastyWebhook(string secret, byte[] body) {
  var ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
  var prefix = Encoding.UTF8.GetBytes($"{ts}.");
  var payload = new byte[prefix.Length + body.Length];
  Buffer.BlockCopy(prefix, 0, payload, 0, prefix.Length);
  Buffer.BlockCopy(body, 0, payload, prefix.Length, body.Length);

  using var mac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
  var sig = Convert.ToHexString(mac.ComputeHash(payload)).ToLowerInvariant();
  return $"t={ts},v1={sig}";
}`,
  },
}

/* ─── agents API snippets (task runs + workflows) ─── */
//
// Runs are the durable, server-driven sibling of /predict: you hand Coasty a
// machine and a task, it runs the agent loop for you and streams lifecycle.
// Workflows compose many runs with a versioned JSON DSL. Bodies validated
// against backend/app/models/public_run_service + workflow_engine
// (extra="forbid"), so every example here passes server-side validation.
//
// Per the docs house rules these carry python + curl for every language slot;
// the remaining slots fall back to a short pointer the way the other snippet
// tables in this file do.

type RunsSnippet = { create: string; events: string; resume: string }

const PY_RUN_CREATE = `import requests

API_KEY = "sk-coasty-live-..."

# Start a task run. Returns status "queued" plus a ONE-TIME webhook_secret
# (only present when you pass webhook_url). Idempotency-Key makes retries safe.
r = requests.post(
    "https://coasty.ai/v1/runs",
    headers={
        "X-API-Key": API_KEY,
        "Idempotency-Key": "invoice-run-4821",
    },
    json={
        "machine_id": "550e8400-e29b-41d4-a716-446655440000",
        "task": "Open the invoice in the browser and read the total.",
        "cua_version": "v3",          # "v4" needs professional tier or above
        "max_steps": 40,
        "on_awaiting_human": "pause", # pause | fail | cancel
        "webhook_url": "https://your.app/hooks/coasty",
    },
)
run = r.json()
print(run["id"], run["status"])               # ... queued
webhook_secret = run.get("webhook_secret")    # shown once — store it now`

const CURL_RUN_CREATE = `curl -X POST https://coasty.ai/v1/runs \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: invoice-run-4821" \\
  -d '{
    "machine_id": "550e8400-e29b-41d4-a716-446655440000",
    "task": "Open the invoice in the browser and read the total.",
    "cua_version": "v3",
    "max_steps": 40,
    "on_awaiting_human": "pause"
  }'

# Response (201):
# {
#   "id": "...",
#   "status": "queued",
#   "cua_version": "v3",
#   "max_steps": 40,
#   "on_awaiting_human": "pause",
#   "webhook_secret": "whsec_shown_once"   <- only when webhook_url was passed
# }`

const PY_RUN_EVENTS = `import requests

# Stream lifecycle as Server-Sent Events. Reconnect with Last-Event-ID to
# replay everything after the last seq you saw — no gaps on a dropped socket.
with requests.get(
    f"https://coasty.ai/v1/runs/{run_id}/events",
    headers={"X-API-Key": API_KEY, "Last-Event-ID": "42"},
    stream=True,
) as r:
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith("data:"):
            print(line[5:].strip())   # status / step / awaiting_human / terminal`

const CURL_RUN_EVENTS = `# -N disables curl buffering so events arrive live.
curl -N https://coasty.ai/v1/runs/$RUN_ID/events \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Last-Event-ID: 42"

# id: 43
# event: status
# data: {"status":"running"}
#
# id: 51
# event: awaiting_human
# data: {"awaiting_human_reason":"Confirm the payment amount"}`

const PY_RUN_RESUME = `import requests

# Cancel a run at any non-terminal state.
requests.post(f"https://coasty.ai/v1/runs/{run_id}/cancel",
              headers={"X-API-Key": API_KEY})

# Resume ONLY works when status == "awaiting_human" (human takeover). Resuming
# any other state returns 409 NOT_AWAITING_HUMAN.
requests.post(
    f"https://coasty.ai/v1/runs/{run_id}/resume",
    headers={"X-API-Key": API_KEY},
    json={"note": "Approved by ops; the total is correct."},
)`

const CURL_RUN_RESUME = `# Cancel
curl -X POST https://coasty.ai/v1/runs/$RUN_ID/cancel \\
  -H "X-API-Key: sk-coasty-live-..."

# Resume — only valid while status == awaiting_human, else 409 NOT_AWAITING_HUMAN
curl -X POST https://coasty.ai/v1/runs/$RUN_ID/resume \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{"note": "Approved by ops; the total is correct."}'`

const RUNS_SNIPPETS: Record<LangId, RunsSnippet> = {
  python:     { create: PY_RUN_CREATE, events: PY_RUN_EVENTS, resume: PY_RUN_RESUME },
  curl:       { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
  javascript: { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
  go:         { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
  ruby:       { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
  php:        { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
  java:       { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
  csharp:     { create: CURL_RUN_CREATE, events: CURL_RUN_EVENTS, resume: CURL_RUN_RESUME },
}

type WorkflowsSnippet = { create: string; run: string }

const PY_WF_CREATE = `import requests

# A workflow is a versioned JSON DSL composing many runs with branching,
# loops, parallelism, asserts, retries, and human approvals. {{var}} pulls
# from earlier steps' results (bound via save_as / step id).
r = requests.post(
    "https://coasty.ai/v1/workflows",
    headers={
        "X-API-Key": "sk-coasty-live-...",
        "Idempotency-Key": "ar-collections-v1",
    },
    json={
        "name": "AR collections",
        "definition": {
            "steps": [
                {"id": "invoice", "type": "task", "save_as": "invoice",
                 "machine_id": "550e8400-e29b-41d4-a716-446655440000",
                 "task": "Open the invoice and read its status + total."},
                {"id": "check", "type": "assert",
                 "condition": {"op": "truthy", "value": "{{invoice.passed}}"},
                 "message": "Agent failed to read the invoice"},
                {"id": "branch", "type": "if",
                 "condition": {"op": "contains",
                               "left": "{{invoice.result}}", "right": "PAID"},
                 "then": [{"id": "ok", "type": "succeed",
                           "output": {"state": "paid"}}],
                 "else": [{"id": "ask", "type": "human_approval",
                           "message": "Invoice unpaid — send reminder?"},
                          {"id": "fin", "type": "succeed",
                           "output": {"state": "reminded"}}]},
            ]
        },
    },
)
workflow = r.json()
print(workflow["id"], workflow["version"])`

const CURL_WF_CREATE = `curl -X POST https://coasty.ai/v1/workflows \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: ar-collections-v1" \\
  -d '{
    "name": "AR collections",
    "definition": {
      "steps": [
        { "id": "invoice", "type": "task", "save_as": "invoice",
          "machine_id": "550e8400-e29b-41d4-a716-446655440000",
          "task": "Open the invoice and read its status + total." },
        { "id": "check", "type": "assert",
          "condition": { "op": "truthy", "value": "{{invoice.passed}}" } },
        { "id": "branch", "type": "if",
          "condition": { "op": "contains",
            "left": "{{invoice.result}}", "right": "PAID" },
          "then": [{ "id": "ok", "type": "succeed",
            "output": { "state": "paid" } }] }
      ]
    }
  }'`

const PY_WF_RUN = `import requests

# Start a run of a SAVED workflow ...
r = requests.post(
    f"https://coasty.ai/v1/workflows/{workflow_id}/runs",
    headers={"X-API-Key": "sk-coasty-live-...", "Idempotency-Key": "wf-run-9"},
    json={"inputs": {"invoice_url": "https://billing.example.com/inv/42"}},
)
wf_run = r.json()
print(wf_run["id"], wf_run["status"])   # ... queued

# ... or run an AD-HOC inline definition without saving it first:
requests.post(
    "https://coasty.ai/v1/workflows/runs",
    headers={"X-API-Key": "sk-coasty-live-..."},
    json={"definition": {"steps": [
        {"id": "t", "type": "task",
         "machine_id": "550e8400-e29b-41d4-a716-446655440000",
         "task": "Take a screenshot and describe the screen."}]}},
)`

const CURL_WF_RUN = `# Start a saved workflow
curl -X POST https://coasty.ai/v1/workflows/$WORKFLOW_ID/runs \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: wf-run-9" \\
  -d '{"inputs": {"invoice_url": "https://billing.example.com/inv/42"}}'

# Ad-hoc inline run (no saved workflow needed)
curl -X POST https://coasty.ai/v1/workflows/runs \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{"definition": {"steps": [
    {"id": "t", "type": "task",
     "machine_id": "550e8400-e29b-41d4-a716-446655440000",
     "task": "Take a screenshot and describe the screen."}]}}'

# Inspect + control:  GET /v1/workflows/runs/{id} · /cancel · /resume`

const WORKFLOWS_SNIPPETS: Record<LangId, WorkflowsSnippet> = {
  python:     { create: PY_WF_CREATE, run: PY_WF_RUN },
  curl:       { create: CURL_WF_CREATE, run: CURL_WF_RUN },
  javascript: { create: CURL_WF_CREATE, run: CURL_WF_RUN },
  go:         { create: CURL_WF_CREATE, run: CURL_WF_RUN },
  ruby:       { create: CURL_WF_CREATE, run: CURL_WF_RUN },
  php:        { create: CURL_WF_CREATE, run: CURL_WF_RUN },
  java:       { create: CURL_WF_CREATE, run: CURL_WF_RUN },
  csharp:     { create: CURL_WF_CREATE, run: CURL_WF_RUN },
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
  group: "Start" | "Predict" | "Local" | "Machines" | "Agents" | "Schedules" | "MCP" | "Errors"
}

const DOC_SECTIONS: DocSection[] = [
  // ── Getting Started ──
  { id: "authentication",         title: "Authentication",         icon: Key,           group: "Start" },
  { id: "how-it-works",           title: "How it Works",           icon: CursorClick,   group: "Start" },
  { id: "quickstart",             title: "Quick Start",            icon: Lightning,     group: "Start" },

  // ── Predict API (the screenshot-to-actions surface) ──
  { id: "response",               title: "Response Format",        icon: BracketsAngle, group: "Predict" },
  { id: "actions",                title: "Action Types",           icon: CursorClick,   group: "Predict" },
  { id: "options",                title: "Request Options",        icon: Textbox,       group: "Predict" },
  { id: "endpoints",              title: "Predict Endpoints",      icon: Terminal,      group: "Predict" },

  // ── Local automation (bring your own screen — no VM required) ──
  { id: "local-overview",         title: "Automate Any Screen",    icon: CursorClick,   group: "Local" },
  { id: "local-loop",             title: "The Local Agent Loop",   icon: Lightning,     group: "Local" },
  { id: "local-presets",          title: "Prompt Presets",         icon: Textbox,       group: "Local" },

  // ── Machines API (the managed-VM surface) ──
  { id: "machines-overview",      title: "Overview & Scopes",      icon: Plugs,         group: "Machines" },
  { id: "machines-provision",     title: "Provision & Lifecycle",  icon: Lightning,     group: "Machines" },
  { id: "machines-actions",       title: "Actions & Batches",      icon: CursorClick,   group: "Machines" },
  { id: "machines-subapi",        title: "Browser, Terminal, Files", icon: Terminal,    group: "Machines" },
  { id: "machines-endpoints",     title: "Machines Endpoints",     icon: ListBullets,   group: "Machines" },

  // ── Agents API (task runs + workflow orchestration) ──
  { id: "agents-overview",        title: "Overview & Scopes",      icon: Plugs,         group: "Agents" },
  { id: "agents-runs",            title: "Task Runs",              icon: Lightning,     group: "Agents" },
  { id: "agents-runs-events",     title: "Run Events & Webhooks",  icon: Terminal,      group: "Agents" },
  { id: "agents-workflows",       title: "Workflows & DSL",        icon: CursorClick,   group: "Agents" },
  { id: "agents-endpoints",       title: "Agents Endpoints",       icon: ListBullets,   group: "Agents" },

  // ── Schedules API (cron + webhooks + chains) ──
  { id: "schedules-overview",     title: "Overview & Pricing",     icon: Plugs,         group: "Schedules" },
  { id: "schedules-lifecycle",    title: "Create & Lifecycle",     icon: Lightning,     group: "Schedules" },
  { id: "schedules-triggers",     title: "Triggers",               icon: CursorClick,   group: "Schedules" },
  { id: "schedules-webhook-fire", title: "Public Webhook Fire",    icon: Terminal,      group: "Schedules" },
  { id: "schedules-endpoints",    title: "Schedules Endpoints",    icon: ListBullets,   group: "Schedules" },

  // ── MCP (Model Context Protocol — for Claude Desktop / Cursor / Windsurf / Claude Code / VS Code Copilot) ──
  { id: "mcp-overview",           title: "What is MCP?",           icon: Plugs,         group: "MCP" },
  { id: "mcp-install",            title: "Install (per client)",   icon: Lightning,     group: "MCP" },
  { id: "mcp-tools",              title: "Available Tools",        icon: ListBullets,   group: "MCP" },

  // ── Errors ──
  { id: "errors",                 title: "Error Handling",         icon: Eye,           group: "Errors" },
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
//
// Collapsible per-group accordion. UX rules:
//   * On first mount, expand only the group that contains the currently
//     active section so the user lands on a useful view (compact list of
//     groups, the relevant one already open).
//   * Clicking a group header toggles its expansion. Multiple groups can be
//     expanded at once — this is NOT a single-accordion (people often want
//     to compare sections across groups).
//   * When the active section changes via scroll, auto-expand its parent
//     group if it's collapsed. We don't auto-collapse other groups — if
//     the user explicitly opened them, leave them alone.
//   * The group header shows: caret (rotates 90° on expand), group title,
//     a tiny dot if a child is the current active section but the group is
//     collapsed (so users see "you're somewhere inside Schedules" even when
//     it's collapsed), and an item count.

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

  // Group containing the active section (used to seed the open-set + to
  // auto-expand on scroll).
  const activeGroup = useMemo<DocSection["group"] | null>(() => {
    const found = DOC_SECTIONS.find((s) => s.id === active)
    return found ? found.group : null
  }, [active])

  // Open-set state. Seeded once on mount (and only on mount) with the
  // active section's group. Auto-expand happens via the effect below
  // without overwriting the user's manual collapses.
  const [openGroups, setOpenGroups] = useState<Set<DocSection["group"]>>(() => {
    const s = new Set<DocSection["group"]>()
    if (activeGroup) s.add(activeGroup)
    return s
  })

  // Auto-expand the group containing the new active section when scroll
  // moves into it. Does NOT touch any other group. If the user closed this
  // group manually 5 seconds ago, scrolling into it re-opens it — that's
  // the right behavior IMO; "show me the current section" wins over
  // "preserve my last collapse".
  useEffect(() => {
    if (!activeGroup) return
    setOpenGroups((prev) => {
      if (prev.has(activeGroup)) return prev
      const next = new Set(prev)
      next.add(activeGroup)
      return next
    })
  }, [activeGroup])

  const toggleGroup = (group: DocSection["group"]) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const expandAll = () => setOpenGroups(new Set(grouped.map(([g]) => g)))
  const collapseAll = () => {
    // Keep the active group open so the indicator stays meaningful.
    const s = new Set<DocSection["group"]>()
    if (activeGroup) s.add(activeGroup)
    setOpenGroups(s)
  }

  const onJump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    if (typeof history !== "undefined") {
      history.replaceState(null, "", `#${id}`)
    }
  }

  // Smooth height/opacity animation for each group's panel.
  const panelMotion = {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  }

  return (
    <nav aria-label="API documentation sections" className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListBullets size={13} weight="duotone" className="text-muted-foreground/40" />
          <span className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-[0.16em]">
            On this page
          </span>
        </div>
        {/* Tiny utility row — expand all / collapse all. Keyboard-friendly. */}
        <div className="flex items-center gap-1.5 text-[9.5px] font-medium text-muted-foreground/35">
          <button
            type="button"
            onClick={expandAll}
            className="hover:text-foreground/70 transition-colors uppercase tracking-wider"
            aria-label="Expand all sections"
          >
            Expand
          </button>
          <span aria-hidden className="text-muted-foreground/20">·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="hover:text-foreground/70 transition-colors uppercase tracking-wider"
            aria-label="Collapse all sections"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {grouped.map(([group, items]) => {
          const isOpen = openGroups.has(group)
          const containsActive = items.some((s) => s.id === active)
          return (
            <div key={group} className="flex flex-col">
              {/* Group header — clickable, expands/collapses */}
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                aria-expanded={isOpen}
                aria-controls={`docs-group-${group}`}
                className={cn(
                  "group/header flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left",
                  "hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.04]",
                  "outline-none focus-visible:ring-1 focus-visible:ring-foreground/20",
                )}
              >
                <CaretRight
                  size={11}
                  weight="bold"
                  className={cn(
                    "shrink-0 text-muted-foreground/35 transition-transform duration-200",
                    isOpen ? "rotate-90" : "rotate-0",
                    "group-hover/header:text-foreground/55",
                  )}
                />
                <span className="text-[9.5px] font-semibold text-muted-foreground/45 uppercase tracking-[0.18em] flex-1">
                  {group}
                </span>
                {/* Indicator: dot when group has active child but is collapsed */}
                {!isOpen && containsActive && (
                  <span
                    aria-hidden
                    className="h-1 w-1 rounded-full bg-foreground/55 shrink-0"
                  />
                )}
                {/* Item count */}
                <span className="text-[9.5px] font-mono text-muted-foreground/25 tabular-nums shrink-0">
                  {items.length}
                </span>
              </button>

              {/* Collapsible panel */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="panel"
                    id={`docs-group-${group}`}
                    role="region"
                    aria-label={`${group} sections`}
                    {...panelMotion}
                    className="overflow-hidden"
                  >
                    <ul className="flex flex-col pt-0.5 pb-1.5 pl-3.5">
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
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

/* ─── Local automation ("automate any screen") sections ─── */

const LOCAL_LANGS: { id: LocalAutomationLang; label: string }[] = [
  { id: "python", label: "Python · pyautogui" },
  { id: "javascript", label: "Node · Playwright" },
  { id: "curl", label: "cURL · one-shot" },
  { id: "go", label: "Go · robotgo" },
]

const SCREEN_SOURCES = [
  { name: "Your own desktop", how: "mss / screencapture / PowerShell — execute with pyautogui" },
  { name: "A browser page", how: "Playwright or Puppeteer screenshot — execute with page.mouse / keyboard" },
  { name: "A phone emulator", how: "adb exec-out screencap — execute with adb input tap / text" },
  { name: "A remote VNC / RDP frame", how: "framebuffer grab — execute by injecting input on the remote" },
  { name: "A Coasty cloud VM", how: "/v1/machines does the whole loop for you, screenshots included" },
]

function LocalAutomationSections() {
  const [lang, setLang] = useState<LocalAutomationLang>("python")
  const [presetId, setPresetId] = useState<string>(PROMPT_PRESETS[0].id)
  const preset = PROMPT_PRESETS.find(p => p.id === presetId) ?? PROMPT_PRESETS[0]
  const executorCol = lang === "javascript" ? "playwright" : "pyautogui"

  return (
    <>
      {/* ─── Local: Overview ─── */}
      <div className="py-8 mb-8">
        <Section
          id="local-overview"
          title="Automate Any Screen"
          icon={CursorClick}
          description="predict, ground and sessions are screen-agnostic: a screenshot goes in, coordinates and actions come out. The pixels can come from anywhere — your own desktop, a browser, a phone emulator, a VNC frame. Coasty VMs are one execution target, not the only one."
        >
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Anything that renders pixels is automatable</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {SCREEN_SOURCES.map(s => (
                <div key={s.name} className="flex items-start gap-3 px-5 py-3">
                  <span className="text-[12px] font-medium text-foreground/70 w-44 shrink-0">{s.name}</span>
                  <span className="text-[11px] text-muted-foreground/45 leading-relaxed">{s.how}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-5 py-4">
            <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5">Coordinates &amp; scaling — read this first</p>
            <p className="text-[12px] text-muted-foreground/60 leading-relaxed">{COORDINATE_SCALING_NOTE}</p>
          </div>
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.015] px-5 py-4">
            <p className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1.5">Safety on a real desktop</p>
            <p className="text-[12px] text-muted-foreground/60 leading-relaxed">{LOCAL_SAFETY_NOTE}</p>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Local: The agent loop ─── */}
      <div className="py-8 mb-8">
        <Section
          id="local-loop"
          title="The Local Agent Loop"
          icon={Lightning}
          description="Screenshot → predict → execute → repeat until status leaves continue. The full pattern below runs on YOUR machine: sessions keep history server-side, the Idempotency-Key makes every step retry-safe, and the executor maps each returned action to a real input event."
        >
          <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-foreground/[0.025] border border-foreground/[0.04] w-fit">
            {LOCAL_LANGS.map(l => (
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

          <GuideCodeBlock
            label={lang === "curl" ? "one-shot — any screenshot in, actions out" : "full agent loop on your screen"}
            code={LOCAL_AUTOMATION_SNIPPETS[lang]}
          />

          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">
                Executing every action type {executorCol === "playwright" ? "in a browser (Playwright)" : "on a desktop (pyautogui)"}
              </span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {ACTION_EXECUTOR_MAP.map(row => (
                <div key={row.actionType} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 px-5 py-3">
                  <code className="text-[11px] font-mono text-foreground/70 w-24 shrink-0">{row.actionType}</code>
                  <span className="text-[10px] font-mono text-muted-foreground/35 w-56 shrink-0 leading-relaxed">{row.params}</span>
                  <code className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed break-all">
                    {executorCol === "playwright" ? row.playwright : row.pyautogui}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Local: Prompt presets ─── */}
      <div className="py-8 mb-8">
        <Section
          id="local-presets"
          title="Prompt Presets"
          icon={Textbox}
          description="Best-practice steering for the `instructions` field — appended to the base agent prompt (unlike system_prompt, which replaces it). Pick the preset that matches your job, copy it, and pass it on session create or any predict call. Custom prompts require Starter or higher."
        >
          <div className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-foreground/[0.025] border border-foreground/[0.04] w-fit">
            {PROMPT_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setPresetId(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150",
                  presetId === p.id
                    ? "bg-background shadow-sm text-foreground border border-foreground/[0.06]"
                    : "text-muted-foreground/45 hover:text-foreground/70"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p className="text-[12px] text-muted-foreground/55 leading-relaxed">{preset.description}</p>

          <GuideCodeBlock
            label={`instructions — ${preset.label}`}
            code={preset.instructions}
          />

          <GuideCodeBlock
            label="using a preset"
            code={`requests.post(f"{API}/sessions", headers=HDRS, json={
    "cua_version": "v3",
    "screen_width": 1280, "screen_height": 720,
    "instructions": PRESET,   # the text above — applies to every step in the session
})`}
          />

          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.015] px-5 py-4">
            <p className="text-[12px] text-muted-foreground/55 leading-relaxed">
              <code className="text-[11px]">instructions</code> is additive steering on top of the tuned base prompt — start here.
              <code className="text-[11px] ml-1">system_prompt</code> fully replaces the base prompt: more power, more ways to break grounding —
              reach for it only when a preset plus task phrasing can&apos;t express what you need. Both draw from the same per-tier
              character budget (Starter 2,000 / Pro 4,000 / Enterprise 16,000; +1 credit / $0.01 per call when the prompt is strictly over 500 chars — exactly 500 is free).
            </p>
          </div>
        </Section>
      </div>
    </>
  )
}

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
                href="/developers/keys"
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
              Send your key as an <code className="text-[11px] px-1.5 py-0.5 rounded-md bg-foreground/[0.04] font-mono">X-API-Key</code> header
              <span className="text-muted-foreground/40"> or </span>
              <code className="text-[11px] px-1.5 py-0.5 rounded-md bg-foreground/[0.04] font-mono">Authorization: Bearer</code>.
              {inApp ? (
                <> Create keys in your <Link href="/developers/keys" className="underline underline-offset-2 hover:text-foreground transition-colors">Developer Dashboard</Link>.</>
              ) : (
                <> Sign up to create API keys.</>
              )} Charges debit your prepaid developer API wallet (1 credit = 1¢ = $0.01) — separate from your Coasty app subscription, even on Unlimited. Fees are charged before execution and auto-refunded on failure.
            </p>
            <GuideCodeBlock label="header" code={`X-API-Key: sk-coasty-live-your_key_here
# or, equivalently:
Authorization: Bearer sk-coasty-live-your_key_here`} />
            <ul className="text-[12px] text-muted-foreground/50 leading-relaxed space-y-1.5 pl-1">
              <li>· Don&apos;t paste the literal <code className="text-[11px] font-mono">&quot;Bearer &quot;</code> prefix into an <code className="text-[11px] font-mono">X-API-Key</code> value.</li>
              <li>· Billed success responses carry <code className="text-[11px] font-mono">X-Credits-Charged</code> + <code className="text-[11px] font-mono">X-Credits-Remaining</code>; the body <code className="text-[11px] font-mono">usage</code> has <code className="text-[11px] font-mono">credits_charged</code> + <code className="text-[11px] font-mono">cost_cents</code> (both 0 on test keys).</li>
              <li>· Test keys (<code className="text-[11px] font-mono">sk-coasty-test-</code>) never bill and use mock VMs; the wire format matches production.</li>
              <li>· POST runs / machines / workflows / schedules accept an <code className="text-[11px] font-mono">Idempotency-Key</code> header so retries are safe.</li>
            </ul>
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
    "credits_charged": 5,
    "cost_cents": 5
  }
}`}
          />
          <p className="text-[11px] text-muted-foreground/45 leading-relaxed">
            Billed responses also carry <code className="text-[11px] font-mono">X-Credits-Charged</code> + <code className="text-[11px] font-mono">X-Credits-Remaining</code> headers.
            On a <code className="text-[11px] font-mono">sk-coasty-test-</code> key, <code className="text-[11px] font-mono">credits_charged</code> and <code className="text-[11px] font-mono">cost_cents</code> are both 0.
          </p>
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
                { f: "cua_version", t: '"v3" | "v4" | "v1" (+3 cr)', req: false },
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
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Surcharges — added to the base fee</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { r: "Per trajectory screenshot (each prior image sent)",                    c: "+2 cr ($0.02)" },
                { r: "Per HD image — strictly larger than 1280×720 (current + trajectory)",  c: "+1 cr ($0.01)" },
                { r: 'v1 engine (cua_version: "v1") — v3 / v4 add nothing',                  c: "+3 cr ($0.03)" },
                { r: "system_prompt over 500 chars (exactly 500 = no fee)",                  c: "+1 cr ($0.01)" },
              ].map(row => (
                <div key={row.r} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-[11px] text-muted-foreground/55 flex-1">{row.r}</span>
                  <code className="text-[10px] font-mono text-foreground/55 shrink-0">{row.c}</code>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
              1 credit = $0.01. Base fees: predict 5 cr ($0.05) · session create 10 cr ($0.10, never carries surcharges) · session predict 4 cr ($0.04) · ground 3 cr ($0.03, HD fee only — single image) · parse Free. Charged up-front, auto-refunded if the call fails (PREDICTION_FAILED / GROUNDING_FAILED).
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════════════════════════════════════════════════════════════════════
           ═════════════════ LOCAL AUTOMATION ═════════════════
           Bring-your-own-screen: the predict surface pointed at the user's
           desktop / a browser / an emulator, executed locally. No VM needed.
           ════════════════════════════════════════════════════════════════════ */}

      <LocalAutomationSections />

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
                  // Runtime is metered per minute (whole credits, floor —
                  // partial credits never billed) against the API wallet:
                  // a small fixed surplus over the underlying cloud cost.
                  // Source of truth: backend machine_runtime_billing.py +
                  // GET /v1/machines/pricing.
                  { r: "Provision — wallet gate, no fee",          c: "20 cr ($0.20) min" },
                  { r: "VM runtime — Linux, running",              c: "5 cr/hr ($0.05)" },
                  { r: "VM runtime — Windows, running",            c: "9 cr/hr ($0.09)" },
                  { r: "starting / stopping / restarting",         c: "running rate" },
                  { r: "VM stopped or suspended (storage only)",   c: "1 cr/hr ($0.01)" },
                  { r: "creating / error / terminated",            c: "Free" },
                  { r: "Auto-destroy TTL (ttl_minutes)",           c: "Free" },
                  { r: "Snapshot create (one-time)",               c: "1 cr ($0.01)" },
                  { r: "Out of funds → VM auto-stopped",           c: "never destroyed" },
                  { r: "Sandbox (sk-coasty-test-*)",               c: "Free" },
                ].map(row => (
                  <div key={row.r} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-[11px] text-muted-foreground/55 flex-1 truncate">{row.r}</span>
                    <code className="text-[10px] font-mono text-foreground/55 shrink-0">{row.c}</code>
                  </div>
                ))}
              </div>
                <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
                  Metered per minute against your API wallet (1 cr = $0.01), rounded down — partial minutes and partial credits are never billed. All per-call machine endpoints (actions, batch, terminal, browser, files, screenshot, connection, lifecycle) are Free — you pay only the hourly runtime. Live table: GET /v1/machines/pricing.
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
          description="Create a VM, list your fleet, and control start/stop/restart/snapshot/terminate. Set ttl_minutes for auto-destroy (extend or clear any time via PATCH). Runtime bills your API wallet per minute at a small surplus over cloud cost. Sandbox keys mock everything in-memory; live keys provision real EC2 / Azure instances."
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
                { m: "GET",    p: "/v1/machines/pricing",        d: "Runtime + one-time price table" },
                { m: "PATCH",  p: "/v1/machines/{id}",           d: "Set / extend / clear auto-destroy TTL" },
                { m: "POST",   p: "/v1/machines/{id}/start",     d: "Start a stopped VM" },
                { m: "POST",   p: "/v1/machines/{id}/stop",      d: "Stop a running VM" },
                { m: "POST",   p: "/v1/machines/{id}/restart",   d: "Restart a running VM" },
                { m: "POST",   p: "/v1/machines/{id}/snapshot",  d: "Create AMI snapshot" },
                { m: "DELETE", p: "/v1/machines/{id}",           d: "Terminate (irreversible)" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                    row.m === "PATCH"  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
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
                { m: "POST",   p: "/v1/machines",                  d: "Provision (runtime 5–9 cr/hr)", c: "20 cr gate" },
                { m: "GET",    p: "/v1/machines",                  d: "List machines",             c: "Free" },
                { m: "GET",    p: "/v1/machines/{id}",             d: "Get a machine",             c: "Free" },
                { m: "GET",    p: "/v1/machines/pricing",          d: "Runtime price table",       c: "Free" },
                { m: "PATCH",  p: "/v1/machines/{id}",             d: "Set / clear auto-destroy TTL", c: "Free" },
                { m: "DELETE", p: "/v1/machines/{id}",             d: "Terminate (irreversible)",  c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/start",       d: "Start stopped VM",          c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/stop",        d: "Stop running VM (1 cr/hr stopped)", c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/restart",     d: "Restart running VM",        c: "Free" },
                { m: "POST",   p: "/v1/machines/{id}/snapshot",    d: "Create AMI snapshot",       c: "1 cr" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                    row.m === "PATCH"  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
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

      {/* ════════════════════════════════════════════════════════════════════
           ═════════════════ AGENTS API ═════════════════
           Durable, server-driven task runs (the async sibling of /predict) and
           workflow orchestration over a versioned JSON DSL. Each section reuses
           the SAME `lang` selector so a reader picks a language once.
           ════════════════════════════════════════════════════════════════════ */}

      {/* ─── Agents: Overview & Scopes ─── */}
      <div className="py-8 mb-8">
        <Section
          id="agents-overview"
          title="Agents API"
          icon={Plugs}
          description="Hand Coasty a machine and a task; it drives the agent loop for you, streams lifecycle, and pauses for a human when needed. Workflows compose many runs with a versioned JSON DSL. Sandbox keys (sk-coasty-test-*) run against mock VMs with no billing."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scopes card */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Scopes</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { s: "runs:read",       d: "list, get, stream run events" },
                  { s: "runs:write",      d: "start, cancel, resume (human takeover)" },
                  { s: "workflows:read",  d: "list/get workflows + workflow runs" },
                  { s: "workflows:write", d: "create, update, delete, start runs" },
                ].map(row => (
                  <div key={row.s} className="flex items-center gap-3 px-5 py-2.5">
                    <code className="text-[11px] font-mono font-semibold text-foreground/65 w-36 shrink-0 truncate">{row.s}</code>
                    <span className="text-[11px] text-muted-foreground/45 flex-1 truncate">{row.d}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
                All four are granted to new keys by default. Run/workflow ids are
                mode-isolated: a test key never sees a live id and vice versa.
              </div>
            </div>

            {/* Concepts card */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Two primitives</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { n: "Run", d: "One task on one machine. Coasty runs the agent loop, streams events, and emits HMAC-signed lifecycle webhooks." },
                  { n: "Workflow", d: "A versioned JSON DSL that composes many runs: task · assert · if · loop · parallel · human_approval · retry · succeed · fail." },
                ].map(row => (
                  <div key={row.n} className="px-5 py-3">
                    <div className="text-[11px] font-semibold text-foreground/70 mb-1">{row.n}</div>
                    <div className="text-[11px] text-muted-foreground/55 leading-relaxed">{row.d}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider shrink-0 mt-0.5">Billing</span>
              <span className="text-[12px] text-muted-foreground/55 leading-relaxed">
                Billed responses carry <code className="text-[11px] font-mono text-foreground/65">X-Credits-Charged</code> + <code className="text-[11px] font-mono text-foreground/65">X-Credits-Remaining</code> headers,
                and the body <code className="text-[11px] font-mono text-foreground/65">usage</code> object exposes <code className="text-[11px] font-mono text-foreground/65">credits_charged</code> + <code className="text-[11px] font-mono text-foreground/65">cost_cents</code> (both 0 on test keys).
                Each agent step costs 5 cr ($0.05) on v3/v4 and 8 cr ($0.08) on v1, charged from your API wallet after the step completes (idempotent per step; a failed charge stops the run with WALLET_EXHAUSTED). Starting a run requires wallet balance ≥ one step&apos;s cost. Each workflow <code className="text-[11px] font-mono text-foreground/65">task</code> step is itself a run with identical per-step billing; control-flow steps (assert · if · loop · parallel · retry · human_approval · succeed · fail) are Free. Total spend is capped by <code className="text-[11px] font-mono text-foreground/65">budget_cents</code> (default 0 = no budget guard) and max_iterations (≤ 1000). Test-mode runs bill 0.
              </span>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Agents: Task Runs ─── */}
      <div className="py-8 mb-8">
        <Section
          id="agents-runs"
          title="Task Runs"
          icon={Lightning}
          description="POST /v1/runs starts a durable run and returns status 'queued' plus a one-time webhook_secret (only when you pass webhook_url). Idempotency-Key makes retries safe. Resume only works while status == awaiting_human."
        >
          <GuideCodeBlock label={`start a run — ${lang}`} code={RUNS_SNIPPETS[lang].create} />

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Request body */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Request Body</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { f: "machine_id",         t: "uuid",                 req: true },
                  { f: "task",               t: "string",               req: true },
                  { f: "cua_version",        t: '"v3" | "v4" | "v1" (8 cr/step)', req: false },
                  { f: "max_steps",          t: "int (1-1000)",         req: false },
                  { f: "on_awaiting_human",  t: '"pause"|"fail"|"cancel"', req: false },
                  { f: "webhook_url",        t: "string (https)",       req: false },
                ].map(row => (
                  <div key={row.f} className="flex items-center gap-3 px-5 py-2.5">
                    <code className="text-[11px] font-mono font-semibold text-foreground/65 w-36 shrink-0 truncate">{row.f}</code>
                    <span className="text-[11px] font-mono text-muted-foreground/30 flex-1 truncate">{row.t}</span>
                    {row.req && <span className="text-[9px] font-semibold text-rose-500/50 shrink-0 uppercase tracking-wider">required</span>}
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
                Header <code className="text-[10px] font-mono">Idempotency-Key</code> (≤ 128 chars) makes a retried POST return the original run.
                <code className="text-[10px] font-mono"> webhook_secret</code> is returned ONCE on create, so store it; it is <code className="text-[10px] font-mono">null</code> on get/list.
              </div>
            </div>

            {/* Response */}
            <GuideCodeBlock
              label="POST /v1/runs — 201 response"
              code={`{
  "id": "...",
  "status": "queued",
  "machine_id": "550e8400-...",
  "task": "Open the invoice ...",
  "cua_version": "v3",
  "max_steps": 40,
  "on_awaiting_human": "pause",
  "step_count": 0,
  "awaiting_human_reason": null,
  "result": null,
  "error": null,
  "created_at": "2026-06-08T17:00:00Z",
  "usage": { "credits_charged": 0, "cost_cents": 0 },
  "webhook_secret": "whsec_shown_once"
}`}
            />
          </div>

          <div className="mt-5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Status Lifecycle</span>
            </div>
            <div className="px-5 py-4">
              <code className="text-[11px] font-mono text-foreground/60 leading-relaxed">
                queued → running → (awaiting_human ⇄ running) → succeeded | failed | cancelled | timed_out
              </code>
              <p className="mt-3 text-[11px] text-muted-foreground/45 leading-relaxed">
                <code className="text-[10px] font-mono">awaiting_human</code> is only reached when <code className="text-[10px] font-mono">on_awaiting_human == &quot;pause&quot;</code>.
                Terminal states are immutable. <code className="text-[10px] font-mono">POST /v1/runs/{"{id}"}/resume</code> is valid <span className="text-foreground/60">only</span> while awaiting a human (otherwise 409 <code className="text-[10px] font-mono">NOT_AWAITING_HUMAN</code>).
                <code className="text-[10px] font-mono"> POST /v1/runs/{"{id}"}/cancel</code> works at any non-terminal state.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <GuideCodeBlock label={`cancel + resume — ${lang}`} code={RUNS_SNIPPETS[lang].resume} />
            <GuideCodeBlock
              label="GET /v1/runs — list (filterable)"
              code={`GET /v1/runs?status=running&limit=20
X-API-Key: sk-coasty-live-...

# Query params:
#   status = queued|running|awaiting_human|succeeded
#            |failed|cancelled|timed_out   (else 400 INVALID_STATUS_FILTER)
#   limit  = 1..200                        (else 400 INVALID_LIMIT)
#
# GET /v1/runs/{id} fetches one run (404 RUN_NOT_FOUND if not yours).`}
            />
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Agents: Run Events & Webhooks ─── */}
      <div className="py-8 mb-8">
        <Section
          id="agents-runs-events"
          title="Run Events & Webhooks"
          icon={Terminal}
          description="Stream lifecycle live over SSE, or receive HMAC-signed lifecycle webhooks. Both let you react the instant a run needs a human or finishes."
        >
          <GuideCodeBlock label={`stream events (SSE) — ${lang}`} code={RUNS_SNIPPETS[lang].events} />

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* SSE notes */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">GET /v1/runs/{"{id}"}/events</code>
              </div>
              <div className="px-5 py-3 text-[11px] text-muted-foreground/55 leading-relaxed space-y-2">
                <p>Server-Sent Events. With <code className="text-[10px] font-mono">curl</code>, pass <code className="text-[10px] font-mono">-N</code> to disable buffering so frames arrive live.</p>
                <p>Each frame has an <code className="text-[10px] font-mono">id:</code> (monotonic seq). Reconnect with <code className="text-[10px] font-mono">Last-Event-ID: &lt;seq&gt;</code> (or <code className="text-[10px] font-mono">?after=&lt;seq&gt;</code>) to replay everything after that point, with no gaps on a dropped socket.</p>
                <p>Event names: <code className="text-[10px] font-mono">status</code> · <code className="text-[10px] font-mono">step</code> · <code className="text-[10px] font-mono">awaiting_human</code> · <code className="text-[10px] font-mono">billing</code> · terminal.</p>
              </div>
            </div>

            {/* Webhook signing */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Lifecycle Webhooks (HMAC)</span>
              </div>
              <div className="px-5 py-3 text-[11px] text-muted-foreground/55 leading-relaxed space-y-2">
                <p>Pass <code className="text-[10px] font-mono">webhook_url</code> on create (HTTPS only) and Coasty POSTs a signed payload on every lifecycle transition.</p>
                <p>Verify with the per-run <code className="text-[10px] font-mono">webhook_secret</code> (returned once):</p>
                <code className="block text-[10px] font-mono text-foreground/60 leading-relaxed bg-foreground/[0.02] rounded-md px-3 py-2">
                  Coasty-Signature: t=&lt;ts&gt;,v1=&lt;hex&gt;<br />
                  v1 = HMAC-SHA256(secret, &quot;&lt;t&gt;.&lt;body&gt;&quot;)
                </code>
                <p>Events: <code className="text-[10px] font-mono">run.awaiting_human</code> · <code className="text-[10px] font-mono">run.succeeded</code> · <code className="text-[10px] font-mono">run.failed</code> · <code className="text-[10px] font-mono">run.cancelled</code> · <code className="text-[10px] font-mono">run.timed_out</code>.</p>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Agents: Workflows & DSL ─── */}
      <div className="py-8 mb-8">
        <Section
          id="agents-workflows"
          title="Workflows & DSL"
          icon={CursorClick}
          description="A versioned JSON DSL composing many runs with branching, loops, parallelism, asserts, retries, and human approvals. {{var}} references pull from earlier steps' results."
        >
          <GuideCodeBlock label={`create a workflow — ${lang}`} code={WORKFLOWS_SNIPPETS[lang].create} />

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Step types */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Step Types</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { c: "task",           d: "Run an agent task. Binds result via save_as + step id." },
                  { c: "assert",         d: "Fail the workflow unless a condition holds." },
                  { c: "if",             d: "Branch on a condition: then / else." },
                  { c: "loop",           d: "Repeat a body (count, or while a condition)." },
                  { c: "parallel",       d: "Run independent branches concurrently." },
                  { c: "human_approval", d: "Pause for a human to approve / reject." },
                  { c: "retry",          d: "Retry a body on failure." },
                  { c: "succeed",        d: "Finish successfully with optional output." },
                  { c: "fail",           d: "Finish as failed with a message." },
                ].map(row => (
                  <div key={row.c} className="flex items-center gap-3 px-5 py-2.5">
                    <code className="text-[11px] font-mono font-semibold text-foreground/65 w-28 shrink-0 truncate">{row.c}</code>
                    <span className="text-[11px] text-muted-foreground/45 flex-1 truncate">{row.d}</span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
                Only <code className="text-[10px] font-mono">task</code> steps bill — 5 cr ($0.05) on v3/v4, 8 cr ($0.08) on v1. All other step types are Free.
              </div>
            </div>

            {/* Conditions + limits */}
            <div className="space-y-5">
              <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
                <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                  <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Condition Ops</span>
                </div>
                <div className="px-5 py-3 flex flex-wrap gap-1.5">
                  {["eq", "ne", "lt", "gt", "lte", "gte", "contains", "truthy", "falsy", "exists", "and", "or", "not"].map(op => (
                    <code key={op} className="text-[10px] font-mono text-foreground/55 px-1.5 py-0.5 rounded bg-foreground/[0.025]">{op}</code>
                  ))}
                  <p className="w-full mt-2 text-[10px] text-muted-foreground/45 leading-relaxed">
                    Structured + injection-safe (no free-text eval). <code className="text-[10px] font-mono">and</code>/<code className="text-[10px] font-mono">or</code> take <code className="text-[10px] font-mono">conditions: [...]</code>; <code className="text-[10px] font-mono">not</code> takes a single <code className="text-[10px] font-mono">condition</code>.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
                <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                  <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Validation Limits</span>
                </div>
                <div className="divide-y divide-foreground/[0.03]">
                  {[
                    { r: "Max steps",          c: "200" },
                    { r: "Max nesting depth",  c: "8 levels" },
                    { r: "Max parallel branches", c: "16" },
                  ].map(row => (
                    <div key={row.r} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-[11px] text-muted-foreground/55 flex-1 truncate">{row.r}</span>
                      <code className="text-[10px] font-mono text-foreground/55 shrink-0">{row.c}</code>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
                  <code className="text-[10px] font-mono">human_approval</code>, <code className="text-[10px] font-mono">succeed</code>, and <code className="text-[10px] font-mono">fail</code> are not allowed inside a <code className="text-[10px] font-mono">parallel</code> branch.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <GuideCodeBlock label={`run a workflow — ${lang}`} code={WORKFLOWS_SNIPPETS[lang].run} />
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Agents: Endpoint reference ─── */}
      <div className="py-8 mb-8">
        <Section
          id="agents-endpoints"
          title="Agents Endpoints"
          icon={ListBullets}
          description="Full reference for runs + workflows. All require X-API-Key (or Authorization: Bearer). POST runs/workflows accept an Idempotency-Key."
        >
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            {/* Group: Task Runs */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Task Runs</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST", p: "/v1/runs",                d: "Start a run (runs:write)",         c: "5–8 cr/step" },
                { m: "GET",  p: "/v1/runs",                d: "List runs (runs:read)",            c: "Free" },
                { m: "GET",  p: "/v1/runs/{id}",           d: "Get a run (runs:read)",            c: "Free" },
                { m: "GET",  p: "/v1/runs/{id}/events",    d: "SSE stream (runs:read)",           c: "Free" },
                { m: "POST", p: "/v1/runs/{id}/cancel",    d: "Cancel (runs:write)",              c: "Free" },
                { m: "POST", p: "/v1/runs/{id}/resume",    d: "Resume when awaiting_human",       c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                                       "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  )}>
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-52 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-20 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* Group: Workflows */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Workflows</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST",   p: "/v1/workflows",                  d: "Create (workflows:write)",        c: "Free" },
                { m: "GET",    p: "/v1/workflows",                  d: "List (workflows:read)",           c: "Free" },
                { m: "GET",    p: "/v1/workflows/{id}",             d: "Get (workflows:read)",            c: "Free" },
                { m: "PUT",    p: "/v1/workflows/{id}",             d: "Update — bumps version",          c: "Free" },
                { m: "DELETE", p: "/v1/workflows/{id}",             d: "Archive a workflow",              c: "Free" },
                { m: "POST",   p: "/v1/workflows/{id}/runs",        d: "Run a saved workflow",            c: "5–8 cr/step" },
                { m: "POST",   p: "/v1/workflows/runs",             d: "Ad-hoc inline definition",        c: "5–8 cr/step" },
                { m: "GET",    p: "/v1/workflows/runs",             d: "List workflow runs",              c: "Free" },
                { m: "GET",    p: "/v1/workflows/runs/{id}",        d: "Get a workflow run",              c: "Free" },
                { m: "GET",    p: "/v1/workflows/runs/{id}/events", d: "SSE stream (Last-Event-ID)",      c: "Free" },
                { m: "POST",   p: "/v1/workflows/runs/{id}/cancel", d: "Cancel a workflow run",           c: "Free" },
                { m: "POST",   p: "/v1/workflows/runs/{id}/resume", d: "Approve/reject a paused step",    c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                    row.m === "PUT"    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" :
                                         "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-52 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-20 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════════════════════════════════════════════════════════════════════
           ════════════════ SCHEDULES API ════════════════
           Cron, run-once (run_at), webhook + email + chain triggers, and
           a public unauthenticated webhook fire endpoint with HMAC verify.
           ════════════════════════════════════════════════════════════════════ */}

      {/* ─── Schedules: Overview & Pricing ─── */}
      <div className="py-8 mb-8">
        <Section
          id="schedules-overview"
          title="Schedules API"
          icon={Plugs}
          description="Cron-fired agent runs, one-shot run_at jobs, plus three trigger kinds (webhook, email, chain). Schedules created via API show up in your /schedules dashboard automatically."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Scopes card */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Scopes</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { s: "schedules:read",  d: "list, get, runs, triggers" },
                  { s: "schedules:write", d: "create, update, delete, pause, run-now" },
                  { s: "triggers:write",  d: "add/remove webhook, email, chain triggers" },
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
                  { r: "Schedule create — wallet gate, no fee",      c: "20 cr ($0.20) min" },
                  { r: "Fire / run-now — wallet gate, no fee",       c: "20 cr ($0.20) min" },
                  { r: "Agent runtime per fire (credit balance)",    c: "10 cr/min" },
                  { r: "Webhook fire — no routing fee (60/min limit)", c: "Free" },
                  { r: "Email fire — no routing fee",              c: "Free" },
                  { r: "Chain trigger (no extra cost)",    c: "Free" },
                  { r: "Pause / resume / list / runs",     c: "Free" },
                  { r: "Sandbox (sk-coasty-test-*)",       c: "Free" },
                ].map(row => (
                  <div key={row.r} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="text-[11px] text-muted-foreground/55 flex-1 truncate">{row.r}</span>
                    <code className="text-[10px] font-mono text-foreground/55 shrink-0">{row.c}</code>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 text-[10px] text-muted-foreground/45 leading-relaxed border-t border-foreground/[0.04]">
                Gates check your API wallet (1 cr = $0.01) but never charge it. Execution time is billed to your Coasty account credit balance — the same balance the app uses — at 10 credits/min, minimum 20 credits to start, max 6 h per session. Webhook fires charge no routing fee: they require the owner&apos;s wallet ≥ 20 cr ($0.20) and are rate-limited (default 60/min per webhook). Test schedules record credits_charged: 0.
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { name: "Frequency presets", body: "every_15_minutes · every_30_minutes · hourly · every_6_hours · every_12_hours · daily · weekly · monthly · custom" },
              { name: "Trigger kinds",     body: "webhook (HMAC) · email (inbound mailbox) · chain (fire when another schedule completes; max depth 5)" },
              { name: "Run history",       body: "Each fire records {status, trigger, duration, credits, error, executed_at}. Cursor-paginated up to 100 retained per schedule." },
            ].map(card => (
              <div key={card.name} className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] px-5 py-3">
                <div className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-1.5">{card.name}</div>
                <div className="text-[11px] text-muted-foreground/55 leading-relaxed">{card.body}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Schedules: Create & Lifecycle ─── */}
      <div className="py-8 mb-8">
        <Section
          id="schedules-lifecycle"
          title="Create & Lifecycle"
          icon={Lightning}
          description="Create a cron or one-shot schedule. Pause, resume, run-now, list runs, soft-delete. Idempotency-Key supported on POST."
        >
          <GuideCodeBlock label={`create a schedule — ${lang}`} code={SCHEDULES_SNIPPETS[lang].create} />

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Frequency presets */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Frequency Presets</span>
              </div>
              <div className="divide-y divide-foreground/[0.03]">
                {[
                  { f: "every_15_minutes", c: "*/15 * * * *" },
                  { f: "every_30_minutes", c: "*/30 * * * *" },
                  { f: "hourly",           c: "0 * * * *" },
                  { f: "every_6_hours",    c: "0 */6 * * *" },
                  { f: "every_12_hours",   c: "0 */12 * * *" },
                  { f: "daily",            c: "0 9 * * *  (override with `time`)" },
                  { f: "weekly",           c: "0 9 * * 1  (override `time`, `day_of_week`)" },
                  { f: "monthly",          c: "0 9 1 * *  (override `time`, `day_of_month`)" },
                  { f: "custom",           c: "supply your own `cron` field" },
                ].map(row => (
                  <div key={row.f} className="flex items-center gap-3 px-5 py-2.5">
                    <code className="text-[11px] font-mono font-semibold text-foreground/65 w-36 shrink-0 truncate">{row.f}</code>
                    <code className="text-[10px] font-mono text-muted-foreground/35 flex-1 truncate">{row.c}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* One-shot run_at */}
            <GuideCodeBlock
              label="one-shot — fire once at a specific UTC time"
              code={`POST /v1/schedules
Content-Type: application/json
X-API-Key: sk-coasty-live-...

{
  "name": "launch announcement",
  "machine_id": "550e8400-e29b-41d4-a716-446655440000",
  "task_prompt": "Post the launch tweet from the draft.",
  "run_at": "2099-01-01T17:00:00Z"
}

# Notes:
#   * \`run_at\` and \`frequency\` are mutually exclusive.
#   * Must be in the future (within last 60s tolerated).
#   * After firing once, the schedule auto-pauses with paused_reason='one_shot_complete'.`}
            />
          </div>

          <div className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider shrink-0 mt-0.5">Lifecycle</span>
              <span className="text-[12px] text-muted-foreground/55 leading-relaxed">
                Schedules are auto-paused after <code className="text-[11px] font-mono text-foreground/65">max_consecutive_failures</code> (default 5) failed runs.
                Resume via <code className="text-[11px] font-mono text-foreground/65">POST /v1/schedules/{"{id}"}/resume</code>.
                Insufficient credits at fire-time auto-pauses with reason <code className="text-[11px] font-mono text-foreground/65">insufficient_credits</code>.
              </span>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Schedules: Triggers ─── */}
      <div className="py-8 mb-8">
        <Section
          id="schedules-triggers"
          title="Triggers"
          icon={CursorClick}
          description="Three trigger kinds. Webhook secrets are returned ONCE — store them on creation."
        >
          <GuideCodeBlock label={`add a webhook trigger — ${lang}`} code={SCHEDULES_SNIPPETS[lang].trigger} />

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* webhook */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">{`{ kind: "webhook" }`}</code>
              </div>
              <div className="px-5 py-3 text-[11px] text-muted-foreground/55 leading-relaxed">
                Returns <code className="text-[10px] font-mono">webhook_url</code> + <code className="text-[10px] font-mono">webhook_secret</code> (whsec_64hex). Sign every fire with
                <code className="text-[10px] font-mono"> HMAC-SHA256(secret, &quot;{"{ts}"}.body&quot;)</code> and send <code className="text-[10px] font-mono">Coasty-Signature: t={"{ts}"},v1={"{sig}"}</code>.
                Replay window 5 min. Idempotent on identical (id, body) within 60 s.
              </div>
            </div>

            {/* email */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">{`{ kind: "email" }`}</code>
              </div>
              <div className="px-5 py-3 text-[11px] text-muted-foreground/55 leading-relaxed">
                Provisions a unique <code className="text-[10px] font-mono">{"<label>.<rand>@agents.coasty.ai"}</code> address.
                Inbound emails fire the schedule. <code className="text-[10px] font-mono">email_label</code> must match
                <code className="text-[10px] font-mono"> ^[a-z0-9][a-z0-9._-]{"{0,32}"}[a-z0-9]$</code>.
              </div>
            </div>

            {/* chain */}
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <code className="text-[10px] font-mono text-muted-foreground/45">{`{ kind: "chain" }`}</code>
              </div>
              <div className="px-5 py-3 text-[11px] text-muted-foreground/55 leading-relaxed">
                Fire this schedule when <code className="text-[10px] font-mono">source_schedule_id</code> completes.
                Events: <code className="text-[10px] font-mono">on_complete</code> · <code className="text-[10px] font-mono">on_failure</code> · <code className="text-[10px] font-mono">on_any</code>.
                <span className="block mt-1.5 text-amber-600/65 dark:text-amber-400/65">Max chain depth: 5.</span>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Trigger Endpoints</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "GET",    p: "/v1/schedules/{id}/triggers",                   d: "List triggers" },
                { m: "POST",   p: "/v1/schedules/{id}/triggers",                   d: "Add a trigger (webhook | email | chain)" },
                { m: "DELETE", p: "/v1/schedules/{id}/triggers/{trigger_id}",      d: "Remove a trigger" },
                { m: "POST",   p: "/v1/triggers/email-mailbox",                    d: "Provision an inbound mailbox" },
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
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-56 truncate">{row.d}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Schedules: Public Webhook Fire (HMAC) ─── */}
      <div className="py-8 mb-8">
        <Section
          id="schedules-webhook-fire"
          title="Public Webhook Fire"
          icon={Terminal}
          description="POST /v1/triggers/webhook/{webhook_id} — UNAUTHENTICATED but HMAC-verified. Hit by Stripe, Linear, n8n, anything that can sign a request."
        >
          <GuideCodeBlock label={`sign + fire a webhook — ${lang}`} code={SCHEDULES_SNIPPETS[lang].signing} />

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <GuideCodeBlock
              label="header format"
              code={`Coasty-Signature: t=<unix_ts>,v1=<hmac_sha256_hex>

# t        = current unix timestamp (seconds)
# v1       = lowercase hex HMAC-SHA256(webhook_secret, "<t>.<body>")
#            (period as separator; raw body bytes; no newline)
# replay   = signatures > 5 min stale are rejected
# dedup    = identical (webhook_id, body) within 60 s returns deduplicated=true
# body cap = 1 MB (413 if exceeded)`}
            />

            <GuideCodeBlock
              label="example response"
              code={`HTTP/1.1 200 OK
Content-Type: application/json
X-Coasty-Request-Id: req_...
X-Coasty-Webhook-Deduplicated: false

{
  "received": true,
  "schedule_id": "550e8400-...",
  "run_id": "550e8400-...",
  "deduplicated": false,
  "message": "Schedule fire dispatched.",
  "request_id": "req_..."
}`}
            />
          </div>

          <div className="mt-5 rounded-xl border border-rose-500/15 bg-rose-500/[0.03] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-semibold text-rose-600/80 dark:text-rose-400/80 uppercase tracking-wider shrink-0 mt-0.5">Security</span>
              <span className="text-[12px] text-muted-foreground/55 leading-relaxed">
                Treat <code className="text-[11px] font-mono text-foreground/65">webhook_secret</code> like a password — it grants the ability to fire your schedule.
                Coasty stores it server-side and uses it to verify every inbound signature.
                If leaked: delete the trigger and re-create to rotate.
              </span>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── Schedules: Endpoint reference ─── */}
      <div className="py-8 mb-8">
        <Section
          id="schedules-endpoints"
          title="Schedules Endpoints"
          icon={ListBullets}
          description="Full reference. Public webhook fire endpoint is the only one without auth (it uses HMAC-signed Coasty-Signature instead)."
        >
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            {/* Lifecycle */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Lifecycle</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "POST",   p: "/v1/schedules",                d: "Create (wallet gate, no fee)",  c: "20 cr gate" },
                { m: "GET",    p: "/v1/schedules",                d: "List schedules",                c: "Free" },
                { m: "GET",    p: "/v1/schedules/{id}",           d: "Get",                            c: "Free" },
                { m: "PATCH",  p: "/v1/schedules/{id}",           d: "Update (partial)",               c: "Free" },
                { m: "DELETE", p: "/v1/schedules/{id}",           d: "Soft-delete",                    c: "Free" },
                { m: "POST",   p: "/v1/schedules/{id}/pause",     d: "Pause future runs",              c: "Free" },
                { m: "POST",   p: "/v1/schedules/{id}/resume",    d: "Resume future runs",             c: "Free" },
                { m: "POST",   p: "/v1/schedules/{id}/run",       d: "Manual fire (runtime 10 cr/min*)", c: "20 cr gate" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                    row.m === "PATCH"  ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" :
                                         "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>
                    {row.m}
                  </span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-56 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-16 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* History */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">History</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "GET", p: "/v1/schedules/{id}/runs",           d: "Cursor-paginated history", c: "Free" },
                { m: "GET", p: "/v1/schedules/{id}/runs/{run_id}",  d: "Get a single run",          c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className="shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">{row.m}</span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-56 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-16 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>

            {/* Triggers */}
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Triggers</span>
            </div>
            <div className="divide-y divide-foreground/[0.03]">
              {[
                { m: "GET",    p: "/v1/schedules/{id}/triggers",                d: "List triggers",                  c: "Free" },
                { m: "POST",   p: "/v1/schedules/{id}/triggers",                d: "Add (webhook | email | chain)",  c: "Free" },
                { m: "DELETE", p: "/v1/schedules/{id}/triggers/{trigger_id}",   d: "Remove",                          c: "Free" },
                { m: "POST",   p: "/v1/triggers/email-mailbox",                 d: "Provision inbound mailbox",      c: "Free" },
                { m: "POST",   p: "/v1/triggers/webhook/{webhook_id}",          d: "Public fire (HMAC, no auth; 60/min, 20 cr wallet gate)", c: "Free" },
              ].map(row => (
                <div key={`${row.m} ${row.p}`} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn(
                    "shrink-0 w-14 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                    row.m === "GET"    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    row.m === "POST"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                                         "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  )}>{row.m}</span>
                  <code className="text-[11px] font-mono text-foreground/60 flex-1 truncate">{row.p}</code>
                  <span className="text-[11px] text-muted-foreground/35 hidden sm:block w-56 truncate">{row.d}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30 w-16 text-right shrink-0">{row.c}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════════════════════════════════════════════════════════════════════
           ════════════════ MCP (Model Context Protocol) ════════════════
           Plug Coasty into Claude Desktop, Claude Code, Cursor, Windsurf,
           VS Code Copilot, and any other MCP-capable host.
           ════════════════════════════════════════════════════════════════════ */}

      {/* ─── MCP: Overview ─── */}
      <div className="py-8 mb-8">
        <Section
          id="mcp-overview"
          title="MCP Server"
          icon={Plugs}
          description="Drive Coasty from any MCP-capable client — Claude Desktop, Claude Code, Cursor, Windsurf, VS Code Copilot. One install, every Coasty tool available."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] px-5 py-4">
              <div className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">What is MCP?</div>
              <p className="text-[12px] text-muted-foreground/65 leading-relaxed">
                MCP (Model Context Protocol) is the open standard, designed by Anthropic and adopted across
                the agent ecosystem, that lets LLM hosts plug into external tools and data.
                Coasty&apos;s MCP server is a thin wrapper over the <code className="text-[11px] font-mono text-foreground/65">/v1</code> API —
                same scopes, same billing. It runs locally via <code className="text-[11px] font-mono text-foreground/65">npx</code>;
                your API key never touches a Coasty MCP relay.
              </p>
            </div>
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] px-5 py-4">
              <div className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Package</div>
              <code className="block text-[12px] font-mono text-foreground/70 mb-2">npm i -g @coasty/mcp</code>
              <p className="text-[11px] text-muted-foreground/55 leading-relaxed">
                Or just point your MCP host at <code className="text-[10px] font-mono">npx -y @coasty/mcp</code> — zero install needed.
                Set <code className="text-[10px] font-mono">COASTY_API_KEY</code> in the host config and you&apos;re running.
                Sandbox keys (<code className="text-[10px] font-mono">sk-coasty-test-*</code>) work for free.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
              <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">What you can do from your editor</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "Predict", body: "Hand the agent a screenshot, get back a sequence of typed actions (click, type, scroll, ...) with exact coordinates." },
                { title: "Drive a VM", body: "Provision a sandbox VM, run terminal commands, navigate a browser, edit files — all from chat." },
                { title: "Schedule a job", body: "Set up a cron job, attach a webhook trigger, hand the secret to your AI to wire into Stripe / Linear / anything." },
              ].map((c) => (
                <div key={c.title} className="rounded-lg border border-foreground/[0.04] bg-foreground/[0.01] px-4 py-3">
                  <div className="text-[11px] font-semibold text-foreground/70 mb-1">{c.title}</div>
                  <div className="text-[11px] text-muted-foreground/55 leading-relaxed">{c.body}</div>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── MCP: Install (per client) ─── */}
      <div className="py-8 mb-8">
        <Section
          id="mcp-install"
          title="Install in your MCP host"
          icon={Lightning}
          description="Pick your client. Configs are checked into the @coasty/mcp test suite — copying any of these blocks verbatim produces a working install."
        >
          <div className="space-y-5">
            <GuideCodeBlock
              label="Claude Desktop — claude_desktop_config.json"
              code={`// macOS:    ~/Library/Application Support/Claude/claude_desktop_config.json
// Windows:  %APPDATA%\\Claude\\claude_desktop_config.json
{
  "mcpServers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}

// Restart Claude Desktop. Coasty tools appear under the 🛠 icon.`}
            />

            <GuideCodeBlock
              label="Claude Code (CLI)"
              code={`claude mcp add coasty \\
  --env COASTY_API_KEY=sk-coasty-test-... \\
  -- npx -y @coasty/mcp

# Verify
claude mcp list
# coasty                     ✓ connected   (24 tools, 2 prompts)`}
            />

            <GuideCodeBlock
              label="Cursor — .cursor/mcp.json (project) or ~/.cursor/mcp.json (global)"
              code={`{
  "mcpServers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}

// Cursor → Settings → MCP shows a green dot when reachable.`}
            />

            <GuideCodeBlock
              label="Windsurf — ~/.codeium/windsurf/mcp_config.json"
              code={`{
  "mcpServers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}`}
            />

            <GuideCodeBlock
              label="VS Code Copilot (Agent mode) — .vscode/mcp.json"
              code={`// VS Code uses "servers" (NOT "mcpServers"). Tools only appear in
// Agent mode — type # in the chat to autocomplete tool names.
{
  "servers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}`}
            />
          </div>

          <div className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider shrink-0 mt-0.5">Tip</span>
              <span className="text-[12px] text-muted-foreground/55 leading-relaxed">
                Use a <code className="text-[11px] font-mono text-foreground/65">sk-coasty-test-*</code> key while you&apos;re iterating —
                everything works (provision, schedule, run) but no real EC2 / Azure / credit billing.
                Swap in <code className="text-[11px] font-mono text-foreground/65">sk-coasty-live-*</code> when you&apos;re ready to ship.
              </span>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ─── MCP: Tools ─── */}
      <div className="py-8 mb-8">
        <Section
          id="mcp-tools"
          title="Tools the MCP server exposes"
          icon={ListBullets}
          description="23 tools across Predict, Machines, Schedules, and Account. All carry MCP annotations (readOnly / destructive / idempotent) so well-behaved hosts confirm before destructive operations."
        >
          <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
            {[
              {
                group: "Predict",
                tools: [
                  { n: "coasty_predict",                   d: "Screenshot + goal → list of actions" },
                  { n: "coasty_ground",                    d: "Element description → (x, y) coords" },
                  { n: "coasty_parse",                     d: "pyautogui code → structured actions (free)" },
                ],
              },
              {
                group: "Machines",
                tools: [
                  { n: "coasty_list_machines",             d: "Read-only — your VMs" },
                  { n: "coasty_get_machine",               d: "Read-only — one VM" },
                  { n: "coasty_take_machine_screenshot",   d: "Read-only — current desktop image" },
                  { n: "coasty_provision_machine",         d: "Create new VM (idempotent w/ key)" },
                  { n: "coasty_terminate_machine",         d: "Destructive — irreversible" },
                  { n: "coasty_start_machine",             d: "Resume a stopped VM" },
                  { n: "coasty_stop_machine",              d: "Pause running VM (preserves state)" },
                  { n: "coasty_execute_machine_action",    d: "Dispatch click / type / scroll / browser_* / file_* / etc." },
                  { n: "coasty_run_terminal_command",      d: "Shell exec on VM (terminal:exec scope)" },
                ],
              },
              {
                group: "Schedules",
                tools: [
                  { n: "coasty_list_schedules",            d: "Read-only" },
                  { n: "coasty_get_schedule",              d: "Read-only" },
                  { n: "coasty_list_schedule_runs",        d: "Cursor-paginated history" },
                  { n: "coasty_create_schedule",           d: "Cron, run-once, or custom — appears in dashboard" },
                  { n: "coasty_update_schedule",           d: "PATCH (any field)" },
                  { n: "coasty_delete_schedule",           d: "Destructive — soft-delete" },
                  { n: "coasty_run_schedule_now",          d: "Manual fire (idempotent w/ key)" },
                  { n: "coasty_pause_schedule",            d: "Disable future fires" },
                  { n: "coasty_resume_schedule",           d: "Re-enable" },
                  { n: "coasty_add_trigger",               d: "Webhook / email / chain (HMAC secret returned ONCE)" },
                  { n: "coasty_remove_trigger",            d: "Destructive" },
                ],
              },
              {
                group: "Account",
                tools: [
                  { n: "coasty_get_credits",               d: "Read-only — balance + tier + period usage" },
                ],
              },
            ].map((section) => (
              <div key={section.group}>
                <div className="px-5 py-2.5 bg-foreground/[0.02] border-y border-foreground/[0.04]">
                  <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">{section.group}</span>
                </div>
                <div className="divide-y divide-foreground/[0.03]">
                  {section.tools.map((t) => (
                    <div key={t.n} className="flex items-center gap-3 px-5 py-2.5">
                      <code className="text-[11px] font-mono font-semibold text-foreground/65 w-64 shrink-0 truncate">{t.n}</code>
                      <span className="text-[11px] text-muted-foreground/45 flex-1 truncate">{t.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] px-5 py-4">
              <div className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Prompts</div>
              <div className="space-y-1.5 text-[11px]">
                <div><code className="font-mono text-foreground/70">start_automation_session</code> <span className="text-muted-foreground/45">— pre-fill a chat that picks a VM, screenshots, predicts, and executes toward a goal.</span></div>
                <div><code className="font-mono text-foreground/70">debug_failed_run</code> <span className="text-muted-foreground/45">— investigate why a schedule has been failing; proposes concrete fixes.</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] px-5 py-4">
              <div className="text-[10px] font-semibold text-muted-foreground/45 uppercase tracking-wider mb-2">Annotations</div>
              <div className="text-[11px] text-muted-foreground/55 leading-relaxed">
                Every tool advertises <code className="font-mono text-[10px] text-foreground/65">readOnlyHint</code>, <code className="font-mono text-[10px] text-foreground/65">destructiveHint</code>, <code className="font-mono text-[10px] text-foreground/65">idempotentHint</code>, and <code className="font-mono text-[10px] text-foreground/65">openWorldHint</code> so a well-configured host can auto-approve safe reads and require explicit consent for destructive ops.
              </div>
            </div>
          </div>
        </Section>
      </div>

      <SectionDivider />

      {/* ════ Errors ════ */}
      <div className="py-8 mb-6">
        <Section id="errors" title="Error Handling" icon={Eye} description="Every error returns the same envelope and an X-Coasty-Request-Id header. The code is stable; the message is for humans. Use code + status to branch.">
          {/* Envelope shape */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GuideCodeBlock
              label="error envelope — every failed request"
              code={`{
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "This key lacks the scope this route requires.",
    "type": "forbidden",
    "request_id": "req_8f2c1e9a",
    "suggestion": "Re-mint the key with runs:write at /developers.",
    "docs_url": "https://coasty.ai/api-docs#errors",
    "required_scope": "runs:write",        // extra context varies by code
    "current_scopes": ["runs:read"]
  }
}`}
            />
            <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden">
              <div className="px-5 py-2.5 bg-foreground/[0.02] border-b border-foreground/[0.04]">
                <span className="text-[10px] font-semibold text-muted-foreground/35 uppercase tracking-wider">Always present</span>
              </div>
              <div className="px-5 py-4 text-[11px] text-muted-foreground/55 leading-relaxed space-y-2">
                <p>Body fields: <code className="text-[10px] font-mono">code</code>, <code className="text-[10px] font-mono">message</code>, <code className="text-[10px] font-mono">type</code>, <code className="text-[10px] font-mono">request_id</code>, <code className="text-[10px] font-mono">suggestion</code>, <code className="text-[10px] font-mono">docs_url</code>, plus code-specific context (e.g. <code className="text-[10px] font-mono">required_scope</code>, <code className="text-[10px] font-mono">balance</code>, <code className="text-[10px] font-mono">details</code>).</p>
                <p>Headers: <code className="text-[10px] font-mono">X-Coasty-Request-Id</code> (quote it in support tickets) and <code className="text-[10px] font-mono">Link: &lt;docs_url&gt;; rel=&quot;help&quot;</code>.</p>
                <p>Auth failures also send <code className="text-[10px] font-mono">WWW-Authenticate: Bearer</code>; transient errors (timeouts, upstream outages) send <code className="text-[10px] font-mono">Retry-After</code>.</p>
                <p>Auto-refunded codes (<code className="text-[10px] font-mono">PREDICTION_FAILED</code>, <code className="text-[10px] font-mono">GROUNDING_FAILED</code>) refund the charge, so you are not billed for a failed model call.</p>
              </div>
            </div>
          </div>

          {/* Troubleshooting: the 5 most common first-week mistakes */}
          <div className="mt-6 rounded-xl border border-amber-500/15 bg-amber-500/[0.03] overflow-hidden">
            <div className="px-5 py-2.5 bg-amber-500/[0.04] border-b border-amber-500/15">
              <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider">Troubleshooting: first-week mistakes</span>
            </div>
            <div className="divide-y divide-amber-500/10">
              {[
                { code: "401", t: "Auth header wrong", f: "Send your key as X-API-Key OR Authorization: Bearer, but never paste the literal \"Bearer \" prefix into the X-API-Key value." },
                { code: "402", t: "Out of credits", f: "Add funds, or develop against a sk-coasty-test- key. Test keys never bill and use mock VMs." },
                { code: "403", t: "Missing scope", f: "The key is valid but lacks the route's scope. Re-mint it with the needed scope at /developers; old keys are not upgraded in place." },
                { code: "422", t: "Bad screenshot / missing field", f: "Strip any data: URI prefix before base64; error.details carries the exact failing field path." },
              ].map(row => (
                <div key={row.code} className="flex items-start gap-4 px-5 py-3.5">
                  <span className="text-[11px] font-mono font-bold text-amber-600/70 dark:text-amber-400/70 w-8 shrink-0 mt-0.5">{row.code}</span>
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold text-foreground/70">{row.t}</div>
                    <div className="text-[11.5px] text-muted-foreground/55 leading-relaxed mt-0.5">{row.f}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full catalog */}
          <div className="mt-6 rounded-xl border border-foreground/[0.06] bg-foreground/[0.01] overflow-hidden divide-y divide-foreground/[0.04]">
            {[
              { code: "400", name: "INVALID_LIMIT",          desc: "limit query param out of range; must be 1..200" },
              { code: "400", name: "INVALID_STATUS_FILTER",  desc: "Unknown ?status= value on a list endpoint" },
              { code: "400", name: "FEATURE_NOT_AVAILABLE",  desc: "The feature is gated off for your tier or this mode" },
              { code: "401", name: "INVALID_API_KEY",        desc: "Missing/invalid key. Send X-API-Key OR Authorization: Bearer (sends WWW-Authenticate). Don't paste \"Bearer \" into X-API-Key" },
              { code: "402", name: "INSUFFICIENT_CREDITS",   desc: "Wallet below required (returns required + balance). Add funds, or use a sk-coasty-test- key" },
              { code: "402", name: "WALLET_EXHAUSTED",       desc: "The API wallet hit zero mid-request" },
              { code: "403", name: "INSUFFICIENT_SCOPE",     desc: "Key valid but lacks scope (returns required_scope + current_scopes). Re-mint at /developers" },
              { code: "404", name: "NOT_FOUND",              desc: "Resource id does not exist or isn't yours" },
              { code: "404", name: "SESSION_NOT_FOUND",      desc: "Session id unknown (mode-isolated; test ids never match live)" },
              { code: "404", name: "RUN_NOT_FOUND",          desc: "Run id unknown or not owned by your key (mode-isolated)" },
              { code: "404", name: "WORKFLOW_NOT_FOUND",     desc: "Workflow id unknown or not owned by your key (mode-isolated)" },
              { code: "409", name: "INVALID_STATE",          desc: "Illegal transition (returns current_state + allowed_from)" },
              { code: "409", name: "NOT_AWAITING_HUMAN",     desc: "Resumed a run/step that wasn't paused for a human" },
              { code: "409", name: "RESUME_CONFLICT",        desc: "Two resumes raced; only the first wins" },
              { code: "409", name: "IDEMPOTENCY_KEY_REUSED", desc: "Same Idempotency-Key reused with a different request body" },
              { code: "413", name: "PAYLOAD_TOO_LARGE",      desc: "Base64 body over the 10 MB cap" },
              { code: "422", name: "VALIDATION_ERROR",       desc: "Body failed validation; error.details = field path that failed" },
              { code: "422", name: "INVALID_SCREENSHOT",     desc: "Screenshot not valid base64; strip the data: prefix first" },
              { code: "500", name: "INTERNAL_ERROR",         desc: "Unexpected server error; retry, and quote the request_id if it persists" },
              { code: "500", name: "PREDICTION_FAILED",      desc: "Model run failed; the charge is auto-refunded" },
              { code: "500", name: "GROUNDING_FAILED",       desc: "Grounding failed; auto-refunded" },
              { code: "503", name: "UPSTREAM_UNAVAILABLE",   desc: "A dependency is down; retry with backoff" },
              { code: "504", name: "UPSTREAM_TIMEOUT",       desc: "Upstream timed out; retry (use Idempotency-Key on POSTs)" },
            ].map((row, i) => (
              <div key={`${row.name}-${i}`} className="flex items-start gap-4 px-5 py-3.5">
                <span className="text-[11px] font-mono font-bold text-muted-foreground/35 w-8 shrink-0 mt-0.5">{row.code}</span>
                <code className="text-[11px] font-mono text-foreground/60 w-52 shrink-0 truncate">{row.name}</code>
                <span className="text-[12px] text-muted-foreground/45 flex-1 leading-relaxed">{row.desc}</span>
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
