"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import {
  BookOpen,
  KeyRound,
  Rocket,
  MousePointerClick,
  Repeat,
  Crosshair,
  ScanText,
  Braces,
  ListChecks,
  FileJson,
  AlertTriangle,
  Gauge,
  Coins,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ===================================================================
   Developer API documentation — a self-contained, professional reference
   for the Computer Use prediction API. Built specifically for the in-app
   /developers/docs page: a prominent always-visible sticky sidebar, a
   mobile pill nav, scroll-spy section tracking, language-tabbed code, and
   high-detail prose. Every code sample is verified against the live v1
   contract (POST https://coasty.ai/v1/*, X-API-Key auth).

   The data constants (DOC_SECTIONS, ACTION_TYPES, ERROR_CODES, RATE_TIERS,
   PRICING, CODE_SAMPLES, RESPONSE_EXAMPLE, ERROR_EXAMPLE) are exported so
   the test suite can assert section integrity, JSON validity, and that
   every snippet targets the correct base URL + auth header.
   =================================================================== */

export const API_BASE = "https://coasty.ai/v1"
export const AUTH_HEADER = "X-API-Key"

/* ─── Section catalogue (drives both the sidebar and scroll-spy) ─── */

export type DocGroup = "Get started" | "Core API" | "Reference"

export interface DocSection {
  id: string
  title: string
  group: DocGroup
  icon: LucideIcon
  /** One-line summary shown under the sidebar entry on hover / in the pill. */
  blurb: string
}

export const DOC_SECTIONS: DocSection[] = [
  { id: "introduction",   title: "Introduction",      group: "Get started", icon: BookOpen,           blurb: "What the API does and how a turn works" },
  { id: "authentication", title: "Authentication",    group: "Get started", icon: KeyRound,           blurb: "API keys, live vs test, and the auth header" },
  { id: "quickstart",     title: "Quickstart",        group: "Get started", icon: Rocket,             blurb: "Your first prediction in under a minute" },
  { id: "predict",        title: "Predict",           group: "Core API",    icon: MousePointerClick,  blurb: "Stateless screenshot → actions" },
  { id: "sessions",       title: "Sessions",          group: "Core API",    icon: Repeat,             blurb: "Stateful, multi-step tasks with memory" },
  { id: "grounding",      title: "Grounding",         group: "Core API",    icon: Crosshair,          blurb: "Resolve a description to exact coordinates" },
  { id: "ocr",            title: "OCR",               group: "Core API",    icon: ScanText,           blurb: "Read on-screen text and bounding boxes" },
  { id: "parse",          title: "Parse",             group: "Core API",    icon: Braces,             blurb: "Turn pyautogui code into structured actions" },
  { id: "actions",        title: "Action types",      group: "Reference",   icon: ListChecks,         blurb: "Every action the model can return" },
  { id: "responses",      title: "Response format",   group: "Reference",   icon: FileJson,           blurb: "The shape of every prediction response" },
  { id: "errors",         title: "Errors",            group: "Reference",   icon: AlertTriangle,      blurb: "Error envelope and HTTP status codes" },
  { id: "rate-limits",    title: "Rate limits",       group: "Reference",   icon: Gauge,              blurb: "Per-tier limits and rate-limit headers" },
  { id: "pricing",        title: "Credits & pricing", group: "Reference",   icon: Coins,              blurb: "What each endpoint costs in credits" },
]

export const DOC_GROUPS: DocGroup[] = ["Get started", "Core API", "Reference"]

/* ─── Reference data ─── */

export interface ActionType {
  type: string
  params: string
  description: string
}

export const ACTION_TYPES: ActionType[] = [
  { type: "click",     params: "{ x, y }",                          description: "Single left click at the given pixel coordinate." },
  { type: "type_text", params: "{ text }",                         description: "Type a literal string at the current focus." },
  { type: "key_press", params: "{ key }",                          description: "Press one key, e.g. \"enter\", \"tab\", \"escape\"." },
  { type: "key_combo", params: "{ keys: [..] }",                   description: "Press a chord, e.g. [\"ctrl\", \"c\"] or [\"cmd\", \"v\"]." },
  { type: "scroll",    params: "{ x, y, direction, amount }",      description: "Scroll up / down / left / right at a position." },
  { type: "drag",      params: "{ from_x, from_y, to_x, to_y }",   description: "Press, move, and release between two points." },
  { type: "move",      params: "{ x, y }",                          description: "Move the cursor without clicking." },
  { type: "wait",      params: "{ ms }",                            description: "Pause before the next step (e.g. for a page load)." },
  { type: "done",      params: "{}",                                description: "The task is complete. status becomes \"done\"." },
  { type: "fail",      params: "{ reason? }",                       description: "The task is impossible. status becomes \"fail\"." },
]

export interface ErrorCode {
  status: number
  code: string
  meaning: string
}

export const ERROR_CODES: ErrorCode[] = [
  { status: 400, code: "INVALID_REQUEST",      meaning: "Malformed body or a field failed validation (missing screenshot, instruction too long)." },
  { status: 401, code: "INVALID_API_KEY",      meaning: "The X-API-Key header is missing, malformed, or the key was revoked." },
  { status: 402, code: "INSUFFICIENT_CREDITS", meaning: "Your shared balance can't cover this request. Top up in the dashboard." },
  { status: 403, code: "INSUFFICIENT_SCOPE",   meaning: "The key is valid but lacks the scope this endpoint requires." },
  { status: 404, code: "NOT_FOUND",            meaning: "The session or resource id does not exist or has expired." },
  { status: 429, code: "RATE_LIMITED",         meaning: "You exceeded your per-minute or concurrent-session limit. Back off and retry." },
  { status: 500, code: "PREDICTION_FAILED",    meaning: "The model run failed. Credits for the request are automatically refunded." },
  { status: 503, code: "SERVICE_UNAVAILABLE",  meaning: "A transient upstream issue. Retry with exponential backoff." },
]

export interface RateTier {
  tier: string
  perMinute: string
  concurrent: string
  trajectory: string
}

export const RATE_TIERS: RateTier[] = [
  { tier: "Free",         perMinute: "3",  concurrent: "1",   trajectory: "3 steps"  },
  { tier: "Starter",      perMinute: "10", concurrent: "3",   trajectory: "5 steps"  },
  { tier: "Professional", perMinute: "20", concurrent: "10",  trajectory: "8 steps"  },
  { tier: "Enterprise",   perMinute: "30", concurrent: "100", trajectory: "20 steps" },
]

export interface PriceRow {
  endpoint: string
  cost: string
  note: string
}

export const PRICING: PriceRow[] = [
  { endpoint: "POST /v1/predict",                  cost: "5 credits", note: "Stateless prediction." },
  { endpoint: "POST /v1/sessions",                 cost: "10 credits", note: "One-time session creation." },
  { endpoint: "POST /v1/sessions/{id}/predict",    cost: "4 credits", note: "Each step inside a session." },
  { endpoint: "POST /v1/ground",                   cost: "3 credits", note: "Coordinate grounding." },
  { endpoint: "POST /v1/ocr",                      cost: "3 credits", note: "Text extraction." },
  { endpoint: "POST /v1/parse",                    cost: "Free",      note: "Deterministic, no model call." },
]

/* ─── Verified code samples (cURL / Python / Node) ─── */

export type LangId = "curl" | "python" | "node" | "go" | "ruby" | "php"

export const LANGS: { id: LangId; label: string }[] = [
  { id: "curl",   label: "cURL" },
  { id: "python", label: "Python" },
  { id: "node",   label: "Node" },
  { id: "go",     label: "Go" },
  { id: "ruby",   label: "Ruby" },
  { id: "php",    label: "PHP" },
]

export type CodeSample = Record<LangId, string>

export const CODE_SAMPLES: Record<string, CodeSample> = {
  predict: {
    curl: `# screen.png is a screenshot of the screen you want to control
SCREENSHOT=$(base64 < screen.png | tr -d '\\n')

curl -s https://coasty.ai/v1/predict \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<EOF
{
  "screenshot": "$SCREENSHOT",
  "instruction": "Click the login button",
  "screen_width": 1920,
  "screen_height": 1080
}
EOF`,
    python: `import base64, os, requests

API_KEY = os.environ["COASTY_API_KEY"]

with open("screen.png", "rb") as f:
    screenshot = base64.b64encode(f.read()).decode()

res = requests.post(
    "https://coasty.ai/v1/predict",
    headers={"X-API-Key": API_KEY},
    json={
        "screenshot": screenshot,
        "instruction": "Click the login button",
        "screen_width": 1920,
        "screen_height": 1080,
    },
    timeout=60,
)
res.raise_for_status()
data = res.json()

print(data["status"])              # "continue" | "done" | "fail"
for action in data["actions"]:
    print(action["action_type"], action["params"])`,
    node: `import { readFileSync } from "node:fs";

const API_KEY = process.env.COASTY_API_KEY;
const screenshot = readFileSync("screen.png").toString("base64");

const res = await fetch("https://coasty.ai/v1/predict", {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    screenshot,
    instruction: "Click the login button",
    screen_width: 1920,
    screen_height: 1080,
  }),
});
if (!res.ok) throw new Error(\`Coasty error \${res.status}\`);

const { status, actions } = await res.json();
console.log(status);               // "continue" | "done" | "fail"
for (const action of actions) {
  console.log(action.action_type, action.params);
}`,
    go: `package main

import (
  "bytes"
  "encoding/base64"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

func main() {
  raw, _ := os.ReadFile("screen.png")
  screenshot := base64.StdEncoding.EncodeToString(raw)

  body, _ := json.Marshal(map[string]any{
    "screenshot":    screenshot,
    "instruction":   "Click the login button",
    "screen_width":  1920,
    "screen_height": 1080,
  })

  req, _ := http.NewRequest("POST", "https://coasty.ai/v1/predict", bytes.NewReader(body))
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")

  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()

  var data map[string]any
  json.NewDecoder(res.Body).Decode(&data)

  fmt.Println(data["status"])            // "continue" | "done" | "fail"
  for _, a := range data["actions"].([]any) {
    action := a.(map[string]any)
    fmt.Println(action["action_type"], action["params"])
  }
}`,
    ruby: `require "base64"
require "json"
require "net/http"

api_key = ENV.fetch("COASTY_API_KEY")
screenshot = Base64.strict_encode64(File.read("screen.png"))

uri = URI("https://coasty.ai/v1/predict")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = api_key
req["Content-Type"] = "application/json"
req.body = {
  screenshot: screenshot,
  instruction: "Click the login button",
  screen_width: 1920,
  screen_height: 1080
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
data = JSON.parse(res.body)

puts data["status"]                  # "continue" | "done" | "fail"
data["actions"].each do |action|
  puts "#{action['action_type']} #{action['params']}"
end`,
    php: `<?php
$apiKey = getenv("COASTY_API_KEY");
$screenshot = base64_encode(file_get_contents("screen.png"));

$ch = curl_init("https://coasty.ai/v1/predict");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: $apiKey",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "screenshot"    => $screenshot,
    "instruction"   => "Click the login button",
    "screen_width"  => 1920,
    "screen_height" => 1080,
  ]),
]);

$data = json_decode(curl_exec($ch), true);
curl_close($ch);

echo $data["status"] . "\\n";          // "continue" | "done" | "fail"
foreach ($data["actions"] as $action) {
  echo $action["action_type"] . " " . json_encode($action["params"]) . "\\n";
}`,
  },

  sessions: {
    curl: `BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

# 1. Create a session and capture its id
SESSION_ID=$(curl -s "$BASE/sessions" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"screen_width":1920,"screen_height":1080}' \\
  | python -c "import sys,json;print(json.load(sys.stdin)['session_id'])")

# 2. Predict a step inside the session (repeat until status != "continue")
curl -s "$BASE/sessions/$SESSION_ID/predict" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$(base64 < screen.png | tr -d '\\n')\\",\\"instruction\\":\\"Book a meeting\\"}"

# 3. Release the session when the task is finished
curl -s -X DELETE "$BASE/sessions/$SESSION_ID" -H "$AUTH"`,
    python: `import base64, os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

def screenshot() -> str:
    with open("screen.png", "rb") as f:
        return base64.b64encode(f.read()).decode()

# 1. Open a session — it remembers the trajectory across steps
session = requests.post(f"{BASE}/sessions", headers=HEADERS, json={
    "screen_width": 1920,
    "screen_height": 1080,
}, timeout=60).json()
session_id = session["session_id"]

# 2. Drive the task one step at a time
try:
    for _ in range(20):  # safety cap
        res = requests.post(
            f"{BASE}/sessions/{session_id}/predict",
            headers=HEADERS,
            json={
                "screenshot": screenshot(),
                "instruction": "Book a meeting tomorrow at 3pm",
            },
            timeout=60,
        ).json()

        for action in res["actions"]:
            perform(action)          # your action executor

        if res["status"] != "continue":
            break
finally:
    # 3. Always release the session to free your concurrency quota
    requests.delete(f"{BASE}/sessions/{session_id}", headers=HEADERS, timeout=30)`,
    node: `const BASE = "https://coasty.ai/v1";
const HEADERS = {
  "X-API-Key": process.env.COASTY_API_KEY,
  "Content-Type": "application/json",
};

// 1. Open a session
const session = await fetch(\`\${BASE}/sessions\`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({ screen_width: 1920, screen_height: 1080 }),
}).then((r) => r.json());

const sessionId = session.session_id;

// 2. Step through the task
try {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(\`\${BASE}/sessions/\${sessionId}/predict\`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        screenshot: await capture(),   // your base64 screenshot
        instruction: "Book a meeting tomorrow at 3pm",
      }),
    }).then((r) => r.json());

    for (const action of res.actions) await perform(action);
    if (res.status !== "continue") break;
  }
} finally {
  // 3. Release the session
  await fetch(\`\${BASE}/sessions/\${sessionId}\`, { method: "DELETE", headers: HEADERS });
}`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

const base = "https://coasty.ai/v1"

func call(method, url string, payload any) map[string]any {
  var reader *bytes.Reader
  if payload != nil {
    b, _ := json.Marshal(payload)
    reader = bytes.NewReader(b)
  } else {
    reader = bytes.NewReader(nil)
  }
  req, _ := http.NewRequest(method, url, reader)
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  var out map[string]any
  json.NewDecoder(res.Body).Decode(&out)
  return out
}

func main() {
  // 1. Create a session
  session := call("POST", base+"/sessions", map[string]any{
    "screen_width": 1920, "screen_height": 1080,
  })
  id := session["session_id"].(string)

  // 2. Step through the task
  for i := 0; i < 20; i++ {
    res := call("POST", fmt.Sprintf("%s/sessions/%s/predict", base, id), map[string]any{
      "screenshot":  capture(), // your base64 screenshot
      "instruction": "Book a meeting tomorrow at 3pm",
    })
    for _, a := range res["actions"].([]any) {
      perform(a) // your executor
    }
    if res["status"] != "continue" {
      break
    }
  }

  // 3. Release the session
  call("DELETE", base+"/sessions/"+id, nil)
}`,
    ruby: `require "base64"
require "json"
require "net/http"

BASE = "https://coasty.ai/v1"
API_KEY = ENV.fetch("COASTY_API_KEY")

def call(method, path, payload = nil)
  uri = URI("#{BASE}#{path}")
  klass = method == "DELETE" ? Net::HTTP::Delete : Net::HTTP::Post
  req = klass.new(uri)
  req["X-API-Key"] = API_KEY
  req["Content-Type"] = "application/json"
  req.body = payload.to_json if payload
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
  JSON.parse(res.body)
end

def screenshot
  Base64.strict_encode64(File.read("screen.png"))
end

# 1. Create a session
session = call("POST", "/sessions", { screen_width: 1920, screen_height: 1080 })
sid = session["session_id"]

begin
  # 2. Step through the task
  20.times do
    res = call("POST", "/sessions/#{sid}/predict", {
      screenshot: screenshot,
      instruction: "Book a meeting tomorrow at 3pm"
    })
    res["actions"].each { |action| perform(action) } # your executor
    break unless res["status"] == "continue"
  end
ensure
  # 3. Release the session
  call("DELETE", "/sessions/#{sid}")
end`,
    php: `<?php
$base = "https://coasty.ai/v1";
$apiKey = getenv("COASTY_API_KEY");

function call($method, $url, $payload = null) {
  global $apiKey;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => [
      "X-API-Key: $apiKey",
      "Content-Type: application/json",
    ],
  ]);
  if ($payload !== null) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
  }
  $out = json_decode(curl_exec($ch), true);
  curl_close($ch);
  return $out;
}

function screenshot() {
  return base64_encode(file_get_contents("screen.png"));
}

// 1. Create a session
$session = call("POST", "$base/sessions", ["screen_width" => 1920, "screen_height" => 1080]);
$sid = $session["session_id"];

try {
  // 2. Step through the task
  for ($i = 0; $i < 20; $i++) {
    $res = call("POST", "$base/sessions/$sid/predict", [
      "screenshot"  => screenshot(),
      "instruction" => "Book a meeting tomorrow at 3pm",
    ]);
    foreach ($res["actions"] as $action) {
      perform($action); // your executor
    }
    if ($res["status"] !== "continue") break;
  }
} finally {
  // 3. Release the session
  call("DELETE", "$base/sessions/$sid");
}`,
  },

  grounding: {
    curl: `curl -s https://coasty.ai/v1/ground \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$SCREENSHOT\\",\\"element\\":\\"the blue Submit button\\"}"`,
    python: `import os, requests

res = requests.post(
    "https://coasty.ai/v1/ground",
    headers={"X-API-Key": os.environ["COASTY_API_KEY"]},
    json={
        "screenshot": screenshot,   # base64 PNG (see Quickstart)
        "element": "the blue Submit button below the form",
    },
    timeout=60,
).json()

print(res["x"], res["y"])           # exact click coordinates`,
    node: `const res = await fetch("https://coasty.ai/v1/ground", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    screenshot,                      // base64 PNG (see Quickstart)
    element: "the blue Submit button below the form",
  }),
}).then((r) => r.json());

console.log(res.x, res.y);`,
    go: `body, _ := json.Marshal(map[string]any{
  "screenshot": screenshot, // base64 PNG (see Quickstart)
  "element":    "the blue Submit button below the form",
})

req, _ := http.NewRequest("POST", "https://coasty.ai/v1/ground", bytes.NewReader(body))
req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, _ := http.DefaultClient.Do(req)
defer res.Body.Close()

var data map[string]any
json.NewDecoder(res.Body).Decode(&data)
fmt.Println(data["x"], data["y"])`,
    ruby: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/ground")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Content-Type"] = "application/json"
req.body = {
  screenshot: screenshot, # base64 PNG (see Quickstart)
  element: "the blue Submit button below the form"
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
data = JSON.parse(res.body)
puts "#{data['x']} #{data['y']}"`,
    php: `<?php
$ch = curl_init("https://coasty.ai/v1/ground");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "screenshot" => $screenshot, // base64 PNG (see Quickstart)
    "element"    => "the blue Submit button below the form",
  ]),
]);

$data = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $data["x"] . ", " . $data["y"] . "\\n";`,
  },

  ocr: {
    curl: `curl -s https://coasty.ai/v1/ocr \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$SCREENSHOT\\"}"`,
    python: `import os, requests

res = requests.post(
    "https://coasty.ai/v1/ocr",
    headers={"X-API-Key": os.environ["COASTY_API_KEY"]},
    json={"screenshot": screenshot},   # base64 PNG (see Quickstart)
    timeout=60,
).json()

print(res["full_text"])
for el in res["elements"]:
    print(repr(el["text"]), "at", (el["left"], el["top"]))`,
    node: `const res = await fetch("https://coasty.ai/v1/ocr", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ screenshot }),   // base64 PNG (see Quickstart)
}).then((r) => r.json());

console.log(res.full_text);
for (const el of res.elements) {
  console.log(el.text, el.left, el.top);
}`,
    go: `body, _ := json.Marshal(map[string]any{
  "screenshot": screenshot, // base64 PNG (see Quickstart)
})

req, _ := http.NewRequest("POST", "https://coasty.ai/v1/ocr", bytes.NewReader(body))
req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, _ := http.DefaultClient.Do(req)
defer res.Body.Close()

var data map[string]any
json.NewDecoder(res.Body).Decode(&data)
fmt.Println(data["full_text"])`,
    ruby: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/ocr")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Content-Type"] = "application/json"
req.body = { screenshot: screenshot }.to_json # base64 PNG (see Quickstart)

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
data = JSON.parse(res.body)
puts data["full_text"]
data["elements"].each { |el| puts "#{el['text']} (#{el['left']}, #{el['top']})" }`,
    php: `<?php
$ch = curl_init("https://coasty.ai/v1/ocr");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode(["screenshot" => $screenshot]), // base64 PNG
]);

$data = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $data["full_text"] . "\\n";
foreach ($data["elements"] as $el) {
  echo $el["text"] . " (" . $el["left"] . ", " . $el["top"] . ")\\n";
}`,
  },

  parse: {
    curl: `curl -s https://coasty.ai/v1/parse \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "pyautogui.click(100, 200)"}'`,
    python: `import os, requests

res = requests.post(
    "https://coasty.ai/v1/parse",
    headers={"X-API-Key": os.environ["COASTY_API_KEY"]},
    json={"code": "pyautogui.click(100, 200)\\npyautogui.typewrite('hello')"},
    timeout=30,
).json()

for action in res["actions"]:
    print(action["action_type"], action["params"])`,
    node: `const res = await fetch("https://coasty.ai/v1/parse", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    code: "pyautogui.click(100, 200)\\npyautogui.typewrite('hello')",
  }),
}).then((r) => r.json());

console.log(res.actions);`,
    go: `body, _ := json.Marshal(map[string]any{
  "code": "pyautogui.click(100, 200)",
})

req, _ := http.NewRequest("POST", "https://coasty.ai/v1/parse", bytes.NewReader(body))
req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, _ := http.DefaultClient.Do(req)
defer res.Body.Close()

var data map[string]any
json.NewDecoder(res.Body).Decode(&data)
fmt.Println(data["actions"])`,
    ruby: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/parse")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Content-Type"] = "application/json"
req.body = { code: "pyautogui.click(100, 200)" }.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
JSON.parse(res.body)["actions"].each { |a| puts "#{a['action_type']} #{a['params']}" }`,
    php: `<?php
$ch = curl_init("https://coasty.ai/v1/parse");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode(["code" => "pyautogui.click(100, 200)"]),
]);

$actions = json_decode(curl_exec($ch), true)["actions"];
curl_close($ch);
print_r($actions);`,
  },
}

/* JSON examples (kept as objects so the test suite can prove they are valid
   and rendered as pretty-printed JSON in the docs). */

export const RESPONSE_EXAMPLE = {
  request_id: "req_8f2c1e9a",
  status: "continue",
  reasoning: "The login form is visible. I'll click the email field, then type the address.",
  actions: [
    { action_type: "click", params: { x: 512, y: 340 }, description: "Click the email field" },
    { action_type: "type_text", params: { text: "you@example.com" }, description: "Type the email address" },
  ],
  raw_code: ["pyautogui.click(512, 340)", "pyautogui.typewrite('you@example.com')"],
  usage: { input_tokens: 1523, output_tokens: 245, credits_charged: 5 },
}

export const ERROR_EXAMPLE = {
  error: {
    code: "INSUFFICIENT_CREDITS",
    message: "Your account does not have enough credits to complete this request.",
    type: "payment_required",
    request_id: "req_8f2c1e9a",
  },
}

/* ===================================================================
   Scroll-spy — highlight the section currently in view. Uses an
   IntersectionObserver against the viewport, which works whether the page
   scrolls the document or an inner overflow container (as DevPageShell does).
   =================================================================== */

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? "")
  const ratios = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.current.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        }
        let best = ""
        let bestRatio = 0
        for (const [id, ratio] of ratios.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio
            best = id
          }
        }
        if (best) setActive(best)
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: [0, 0.2, 0.5, 0.85, 1] },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}

function scrollToSection(id: string) {
  if (typeof document === "undefined") return
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/* ===================================================================
   Building blocks
   =================================================================== */

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    const done = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => {})
    } else {
      done()
    }
  }, [value])

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium transition-colors",
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground/55 hover:text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      {copied ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  )
}

/** Language-tabbed code block with copy. Falls back to a single block when
    only one language is supplied. */
function CodeTabs({ sample, lang, onLang }: { sample: CodeSample; lang: LangId; onLang: (l: LangId) => void }) {
  const code = sample[lang]
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-2.5 py-1.5">
        <div role="tablist" aria-label="Language" className="flex items-center gap-0.5 overflow-x-auto scrollbar-invisible min-w-0">
          {LANGS.map((l) => {
            const active = l.id === lang
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={active}
                onClick={() => onLang(l.id)}
                className={cn(
                  "h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors shrink-0",
                  active
                    ? "bg-foreground/[0.08] dark:bg-foreground/[0.12] text-foreground"
                    : "text-muted-foreground/55 hover:text-foreground/85",
                )}
              >
                {l.label}
              </button>
            )
          })}
        </div>
        <div className="shrink-0">
          <CopyButton value={code} />
        </div>
      </div>
      <pre className="px-3.5 py-3 text-[12px] leading-[1.7] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/45">JSON</span>
        <CopyButton value={text} />
      </div>
      <pre className="px-3.5 py-3 text-[12px] leading-[1.7] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
        <code>{text}</code>
      </pre>
    </div>
  )
}

/** A documentation section. Registers an id for scroll-spy and applies a
    scroll-margin so anchored jumps clear the sticky chrome. */
function DocBlock({ section, children }: { section: DocSection; children: ReactNode }) {
  const Icon = section.icon
  return (
    <motion.section
      id={section.id}
      data-doc-section={section.id}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-24 pt-2"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/55">
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground">{section.title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.section>
  )
}

/** Reusable prose paragraph with consistent docs typography. */
function P({ children }: { children: ReactNode }) {
  return <p className="text-[13.5px] leading-[1.75] text-muted-foreground/75 max-w-2xl">{children}</p>
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground/85">
      {children}
    </code>
  )
}

/** Small bordered reference table. */
function RefTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="rounded-xl border border-foreground/[0.07] overflow-hidden">
      <div className="overflow-x-auto scrollbar-invisible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-foreground/[0.07] bg-foreground/[0.02]">
              {head.map((h) => (
                <th key={h} className="px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.015] transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-3.5 py-2.5 text-[12.5px] text-foreground/75 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.015] px-4 py-3">
      <Terminal className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.7} />
      <div className="text-[12.5px] leading-[1.7] text-muted-foreground/70">{children}</div>
    </div>
  )
}

/* ===================================================================
   Sidebar (desktop) + pill nav (mobile)
   =================================================================== */

function Sidebar({ active }: { active: string }) {
  return (
    <nav aria-label="Documentation sections" className="flex flex-col gap-5">
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/40">
            {group}
          </div>
          <ul className="space-y-0.5">
            {DOC_SECTIONS.filter((s) => s.group === group).map((s) => {
              const isActive = s.id === active
              const Icon = s.icon
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      scrollToSection(s.id)
                    }}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-muted-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.03]",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="docs-active-bar"
                        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-foreground"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={isActive ? 2.1 : 1.7} />
                    <span className="truncate">{s.title}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function MobilePillNav({ active }: { active: string }) {
  return (
    <div className="lg:hidden sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/80 backdrop-blur-xl border-b border-foreground/[0.06]">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-invisible">
        {DOC_SECTIONS.map((s) => {
          const isActive = s.id === active
          return (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "shrink-0 h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.05] text-muted-foreground/65 hover:text-foreground",
              )}
            >
              {s.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ===================================================================
   The documentation content
   =================================================================== */

function DocsBody() {
  const [lang, setLang] = useState<LangId>("python")
  const sampleProps = (key: keyof typeof CODE_SAMPLES) => ({
    sample: CODE_SAMPLES[key],
    lang,
    onLang: setLang,
  })

  return (
    <div className="space-y-12">

      {/* ── Introduction ── */}
      <DocBlock section={DOC_SECTIONS[0]}>
        <P>
          The Coasty Computer Use API gives your code the ability to see a screen and act on it. You
          send a screenshot and a plain-language instruction; the model returns a precise list of
          actions — clicks, keystrokes, scrolls, and drags — with exact pixel coordinates. Your
          program performs those actions, captures a new screenshot, and asks again. That loop is how
          an agent drives any interface, real or virtual, without brittle selectors or per-app scripts.
        </P>
        <P>
          Everything is a normal HTTPS request to <InlineCode>{API_BASE}</InlineCode>. There is no SDK
          to install and no websocket to manage for the core endpoints: each call is stateless unless
          you opt into a <Link href="#sessions" onClick={(e) => { e.preventDefault(); scrollToSection("sessions") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">session</Link>.
          Responses are JSON and stream nothing, so any HTTP client works.
        </P>
        <RefTable
          head={["Step", "What happens"]}
          rows={[
            [<span key="a" className="font-medium text-foreground/80">1. Capture</span>, "Take a screenshot of the screen you want to control and base64-encode it."],
            [<span key="b" className="font-medium text-foreground/80">2. Predict</span>, <>POST it with an instruction to <InlineCode>/predict</InlineCode>. You get back a list of actions.</>],
            [<span key="c" className="font-medium text-foreground/80">3. Act</span>, "Execute those actions on your machine, VM, or browser."],
            [<span key="d" className="font-medium text-foreground/80">4. Repeat</span>, <>Capture a fresh screenshot and call again until <InlineCode>status</InlineCode> is <InlineCode>done</InlineCode>.</>],
          ]}
        />
      </DocBlock>

      {/* ── Authentication ── */}
      <DocBlock section={DOC_SECTIONS[1]}>
        <P>
          Every request must include your secret key in the <InlineCode>{AUTH_HEADER}</InlineCode>{" "}
          header. Keys are created and revoked from the{" "}
          <Link href="/developers/keys" className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">API keys</Link>{" "}
          page. Treat a key like a password: keep it server-side, store it in an environment variable,
          and never commit it or ship it in client-side code.
        </P>
        <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/45">Header</span>
            <CopyButton value={`${AUTH_HEADER}: sk-coasty-live-your_key_here`} />
          </div>
          <pre className="px-3.5 py-3 text-[12px] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
            <code>{`${AUTH_HEADER}: sk-coasty-live-your_key_here`}</code>
          </pre>
        </div>
        <RefTable
          head={["Prefix", "Kind", "Behaviour"]}
          rows={[
            [<InlineCode key="a">sk-coasty-live-</InlineCode>, <span key="b" className="font-medium text-foreground/80">Live</span>, "Runs the real model and deducts credits from your balance."],
            [<InlineCode key="c">sk-coasty-test-</InlineCode>, <span key="d" className="font-medium text-foreground/80">Test</span>, "Returns mock responses and never bills. Ideal for local dev and CI."],
          ]}
        />
        <Callout>
          Prefer test keys while you wire up your integration. They exercise the exact same request and
          response shapes with zero cost, so you can build and run CI confidently before flipping to a
          live key.
        </Callout>
      </DocBlock>

      {/* ── Quickstart ── */}
      <DocBlock section={DOC_SECTIONS[2]}>
        <P>
          Set <InlineCode>COASTY_API_KEY</InlineCode> in your environment, then send your first
          prediction. The call below uploads a screenshot, asks the model to click a button, and prints
          the actions it returns. Pick your language:
        </P>
        <CodeTabs {...sampleProps("predict")} />
        <P>
          A successful response contains an <InlineCode>actions</InlineCode> array and a{" "}
          <InlineCode>status</InlineCode> of <InlineCode>continue</InlineCode>,{" "}
          <InlineCode>done</InlineCode>, or <InlineCode>fail</InlineCode>. Execute each action in order,
          take a new screenshot, and call again while the status is <InlineCode>continue</InlineCode>.
        </P>
      </DocBlock>

      {/* ── Predict ── */}
      <DocBlock section={DOC_SECTIONS[3]}>
        <P>
          <InlineCode>POST /v1/predict</InlineCode> is the stateless workhorse. Each call is independent:
          you provide the full context every time, which makes it simple to reason about and trivial to
          scale horizontally. Use it for one-shot decisions and for loops where you manage history
          yourself. When a task needs the model to remember prior steps automatically, reach for{" "}
          <Link href="#sessions" onClick={(e) => { e.preventDefault(); scrollToSection("sessions") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">sessions</Link>{" "}
          instead.
        </P>
        <RefTable
          head={["Field", "Type", "Required", "Description"]}
          rows={[
            [<InlineCode key="a">screenshot</InlineCode>, "string", <span key="b" className="text-foreground/80">Yes</span>, "Base64-encoded PNG or JPEG of the current screen."],
            [<InlineCode key="c">instruction</InlineCode>, "string", <span key="d" className="text-foreground/80">Yes</span>, "Natural-language goal, e.g. \"Click the login button\"."],
            [<InlineCode key="e">screen_width</InlineCode>, "int", "No", "Width in pixels (default 1920). Improves coordinate accuracy."],
            [<InlineCode key="f">screen_height</InlineCode>, "int", "No", "Height in pixels (default 1080)."],
            [<InlineCode key="g">max_actions</InlineCode>, "int", "No", "Cap on actions returned per call (default 5)."],
            [<InlineCode key="h">tools</InlineCode>, "string[]", "No", "Restrict to a subset of action types, e.g. [\"click\", \"type_text\"]."],
            [<InlineCode key="i">include_reasoning</InlineCode>, "bool", "No", "Return the model's reasoning string (default true)."],
          ]}
        />
        <P>The response is the standard prediction shape, covered in <Link href="#responses" onClick={(e) => { e.preventDefault(); scrollToSection("responses") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Response format</Link>.</P>
      </DocBlock>

      {/* ── Sessions ── */}
      <DocBlock section={DOC_SECTIONS[4]}>
        <P>
          A session keeps the trajectory — the running history of screenshots and actions — on our side,
          so each step only needs the latest screenshot and instruction. This produces better multi-step
          behaviour on long tasks and keeps your request bodies small. Create a session once, step
          through the task, then delete it to release your concurrency quota.
        </P>
        <CodeTabs {...sampleProps("sessions")} />
        <RefTable
          head={["Endpoint", "Purpose"]}
          rows={[
            [<InlineCode key="a">POST /v1/sessions</InlineCode>, "Create a session. Returns a session_id valid for 24h of inactivity."],
            [<InlineCode key="b">POST /v1/sessions/{"{id}"}/predict</InlineCode>, "Predict the next step. Body is just screenshot + instruction."],
            [<InlineCode key="c">POST /v1/sessions/{"{id}"}/reset</InlineCode>, "Clear history to start a new task on the same session. Free."],
            [<InlineCode key="d">DELETE /v1/sessions/{"{id}"}</InlineCode>, "End the session and free a concurrency slot. Free."],
          ]}
        />
        <Callout>
          Always delete a session in a <InlineCode>finally</InlineCode> block. Sessions count against
          your tier&apos;s concurrent-session limit, and orphaned sessions only expire after 24 hours of
          inactivity.
        </Callout>
      </DocBlock>

      {/* ── Grounding ── */}
      <DocBlock section={DOC_SECTIONS[5]}>
        <P>
          Grounding answers a narrower question than predict: &ldquo;where is this element?&rdquo; Give it
          a screenshot and a description and it returns the exact <InlineCode>x</InlineCode>,{" "}
          <InlineCode>y</InlineCode> coordinate to target. It is faster and cheaper than a full
          prediction, which makes it ideal when you already know what to do and only need a pixel to
          click.
        </P>
        <CodeTabs {...sampleProps("grounding")} />
        <P>
          The response is <InlineCode>{`{ x, y, usage, request_id }`}</InlineCode>. Coordinates are in
          the same pixel space as the screenshot you sent.
        </P>
      </DocBlock>

      {/* ── OCR ── */}
      <DocBlock section={DOC_SECTIONS[6]}>
        <P>
          OCR extracts every piece of visible text from a screenshot, each with its bounding box. Use it
          to assert that a page reached the expected state, to scrape values, or to feed text into your
          own logic. Returns a flat <InlineCode>full_text</InlineCode> string plus an{" "}
          <InlineCode>elements</InlineCode> array of <InlineCode>{`{ text, left, top, width, height }`}</InlineCode>.
        </P>
        <CodeTabs {...sampleProps("ocr")} />
      </DocBlock>

      {/* ── Parse ── */}
      <DocBlock section={DOC_SECTIONS[7]}>
        <P>
          Parse converts a block of <InlineCode>pyautogui</InlineCode> code into the same structured
          action objects the model returns. It is deterministic, runs no model, and is free. Use it to
          migrate existing automation scripts onto Coasty&apos;s executor, or to normalise hand-written
          steps into the canonical action schema.
        </P>
        <CodeTabs {...sampleProps("parse")} />
      </DocBlock>

      {/* ── Action types ── */}
      <DocBlock section={DOC_SECTIONS[8]}>
        <P>
          Every action the model can return uses an <InlineCode>action_type</InlineCode> from the table
          below, paired with a <InlineCode>params</InlineCode> object. Your executor switches on the
          type and applies the parameters. The terminal types — <InlineCode>done</InlineCode> and{" "}
          <InlineCode>fail</InlineCode> — set the response <InlineCode>status</InlineCode> and signal you
          to stop looping.
        </P>
        <RefTable
          head={["Action", "Params", "Description"]}
          rows={ACTION_TYPES.map((a) => [
            <InlineCode key={a.type}>{a.type}</InlineCode>,
            <code key={`${a.type}-p`} className="font-mono text-[11.5px] text-muted-foreground/60">{a.params}</code>,
            a.description,
          ])}
        />
      </DocBlock>

      {/* ── Response format ── */}
      <DocBlock section={DOC_SECTIONS[9]}>
        <P>
          Predict and session-predict return the same shape. <InlineCode>actions</InlineCode> is the
          ordered list to execute; <InlineCode>status</InlineCode> tells you whether to keep going
          (<InlineCode>continue</InlineCode>), stop successfully (<InlineCode>done</InlineCode>), or stop
          because the task is impossible (<InlineCode>fail</InlineCode>). <InlineCode>usage</InlineCode>{" "}
          reports tokens and the credits charged for the call.
        </P>
        <JsonBlock value={RESPONSE_EXAMPLE} />
        <RefTable
          head={["Field", "Description"]}
          rows={[
            [<InlineCode key="a">request_id</InlineCode>, "Unique id for the call. Include it when contacting support."],
            [<InlineCode key="b">status</InlineCode>, <>One of <InlineCode>continue</InlineCode>, <InlineCode>done</InlineCode>, <InlineCode>fail</InlineCode>.</>],
            [<InlineCode key="c">actions</InlineCode>, "Ordered list of actions to perform this step."],
            [<InlineCode key="d">reasoning</InlineCode>, "The model's explanation (omitted if include_reasoning is false)."],
            [<InlineCode key="e">raw_code</InlineCode>, "The equivalent pyautogui lines, if you prefer to run those."],
            [<InlineCode key="f">usage</InlineCode>, <>Tokens and <InlineCode>credits_charged</InlineCode> for the request.</>],
          ]}
        />
      </DocBlock>

      {/* ── Errors ── */}
      <DocBlock section={DOC_SECTIONS[10]}>
        <P>
          Errors return a non-2xx status and a JSON envelope under an <InlineCode>error</InlineCode> key.
          The <InlineCode>code</InlineCode> is stable and safe to branch on; <InlineCode>message</InlineCode>{" "}
          is human-readable and may change. Always log <InlineCode>request_id</InlineCode> — it is the
          fastest way for us to trace a failed call.
        </P>
        <JsonBlock value={ERROR_EXAMPLE} />
        <RefTable
          head={["Status", "Code", "Meaning"]}
          rows={ERROR_CODES.map((e) => [
            <span key={`${e.code}-s`} className="font-mono text-[12px] text-foreground/80">{e.status}</span>,
            <InlineCode key={`${e.code}-c`}>{e.code}</InlineCode>,
            e.meaning,
          ])}
        />
        <Callout>
          Treat <InlineCode>429</InlineCode> and <InlineCode>503</InlineCode> as retryable with
          exponential backoff. A <InlineCode>500</InlineCode> automatically refunds the request&apos;s
          credits, so it is safe to retry idempotent calls.
        </Callout>
      </DocBlock>

      {/* ── Rate limits ── */}
      <DocBlock section={DOC_SECTIONS[11]}>
        <P>
          Limits apply per key and, in aggregate, per account. Every response carries{" "}
          <InlineCode>X-RateLimit-Limit</InlineCode>, <InlineCode>X-RateLimit-Remaining</InlineCode>, and{" "}
          <InlineCode>X-RateLimit-Reset</InlineCode> (a Unix timestamp) so you can pace requests precisely
          rather than guessing. When you exceed a limit you get <InlineCode>429 RATE_LIMITED</InlineCode>.
        </P>
        <RefTable
          head={["Tier", "Requests / min", "Concurrent sessions", "Trajectory"]}
          rows={RATE_TIERS.map((t) => [
            <span key={`${t.tier}-t`} className="font-medium text-foreground/80">{t.tier}</span>,
            <span key={`${t.tier}-m`} className="font-mono tabular-nums">{t.perMinute}</span>,
            <span key={`${t.tier}-c`} className="font-mono tabular-nums">{t.concurrent}</span>,
            t.trajectory,
          ])}
        />
      </DocBlock>

      {/* ── Pricing ── */}
      <DocBlock section={DOC_SECTIONS[12]}>
        <P>
          Requests are billed in credits from your shared balance. Credits are charged before the model
          runs and automatically refunded if a request fails server-side. High-resolution screenshots
          (above 1280×720) and longer trajectories add a small surcharge; test keys are always free.
        </P>
        <RefTable
          head={["Endpoint", "Cost", "Notes"]}
          rows={PRICING.map((p) => [
            <InlineCode key={p.endpoint}>{p.endpoint}</InlineCode>,
            <span key={`${p.endpoint}-c`} className="font-medium text-foreground/80 whitespace-nowrap">{p.cost}</span>,
            p.note,
          ])}
        />
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/developers/keys"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12.5px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-all"
          >
            Create an API key
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/developers/usage"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12.5px] font-medium border border-foreground/[0.1] text-muted-foreground/75 hover:text-foreground hover:border-foreground/20 transition-all"
          >
            View your usage
          </Link>
        </div>
      </DocBlock>
    </div>
  )
}

/* ===================================================================
   Public component
   =================================================================== */

export function DeveloperDocs() {
  const ids = useMemo(() => DOC_SECTIONS.map((s) => s.id), [])
  const active = useActiveSection(ids)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)] gap-x-10">
      {/* Sticky sidebar — always visible on lg+, the primary way to navigate. */}
      <aside className="hidden lg:block">
        <div className="sticky top-2 max-h-[calc(100dvh-1rem)] overflow-y-auto scrollbar-invisible rounded-2xl border border-foreground/[0.06] bg-foreground/[0.012] p-3">
          <div className="px-2.5 pb-2.5 mb-2 border-b border-foreground/[0.06]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/40">Reference</div>
            <div className="text-[13px] font-semibold text-foreground/85 mt-0.5">Computer Use API</div>
          </div>
          <Sidebar active={active} />
        </div>
      </aside>

      {/* Content. The mobile pill nav lives at the top of this column. */}
      <div className="min-w-0">
        <MobilePillNav active={active} />
        <div className="pt-4 lg:pt-0">
          <DocsBody />
        </div>
      </div>
    </div>
  )
}
