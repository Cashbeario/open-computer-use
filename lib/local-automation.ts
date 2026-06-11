/**
 * Local automation ("automate ANY screen") — single source of truth for the
 * docs surfaces (app/guide/tabs/api.tsx, app/api-docs/page.tsx,
 * lib/coasty-api-docs-md.ts) and their anti-drift tests.
 *
 * The core idea this documents: /v1/predict, /v1/ground and /v1/sessions are
 * SCREEN-AGNOSTIC. They take a screenshot in and return coordinates/actions
 * out. The pixels can come from anywhere — the user's own desktop, a browser
 * page, a phone emulator, a VNC/RDP frame, a Citrix window. Coasty-managed
 * VMs (/v1/machines) are one execution target, not the only one.
 *
 * Request bodies inside these snippets are validated against the backend
 * Pydantic models by backend/tests/test_doc_examples.py
 * (TestLocalAutomationDocExamples) — change a field here and that suite
 * fails before a customer sees a 422.
 */

// ── Best-suggestion prompt presets ──────────────────────────────────────────
//
// Ready-made values for the `instructions` request field (APPENDED to the
// base agent prompt — unlike `system_prompt`, which replaces it). Custom
// prompts require Starter or higher (free-tier max_system_prompt_chars = 0);
// every preset stays under the 2 000-char Starter budget, pinned by
// tests/docs-local-automation.test.ts.

export interface PromptPreset {
  id: string
  label: string
  /** One-line "when to pick this" shown in the selector UI. */
  description: string
  /** Value for the `instructions` field. */
  instructions: string
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: "precise-ui",
    label: "Precise UI control",
    description: "Default pick — careful clicking on real desktops where mis-clicks have consequences.",
    instructions:
      "Be precise. Before clicking, confirm the target element is actually visible in the CURRENT screenshot — never click from memory of a previous screen. Click the visual center of elements, not their edges. If the element you need is not visible, scroll toward where it should be instead of guessing coordinates. If two elements look similar, prefer the one whose text matches the task exactly. After typing into a field, verify focus landed in the right field before continuing.",
  },
  {
    id: "forms-data-entry",
    label: "Forms & data entry",
    description: "Filling forms, spreadsheets, CRMs — keyboard-first, validates every field.",
    instructions:
      "You are doing data entry. Prefer keyboard navigation (Tab between fields, Enter to submit) over clicking when a form has focus. Clear a field (ctrl+a then type) before entering a new value — never append to stale text. Enter values EXACTLY as given in the task: do not reformat dates, trim IDs, or autocorrect spellings. After filling each field, confirm the screenshot shows the value you typed. Do not submit the form until every required field is verified filled.",
  },
  {
    id: "qa-regression",
    label: "QA & regression testing",
    description: "Exercising an app under test — observes carefully, reports failures instead of working around them.",
    instructions:
      "You are executing a QA test step. Follow the instruction literally — do NOT improvise workarounds when the UI misbehaves; surfacing the failure is the point. If an expected element is missing, a button is disabled, or an error/dialog appears that the task does not mention, stop and emit fail() with what you observed. Wait for loading indicators to finish before asserting anything. If warnings or console-style error text appear, stop and fail() with what you see.",
  },
  {
    id: "read-extract",
    label: "Read & extract",
    description: "Reading values off the screen with minimal interaction — navigation only when needed.",
    instructions:
      "Your goal is to READ information from the screen, not to change anything. Interact only to reveal the data (scroll, switch tabs, expand rows) — never edit, submit, or delete. When you can see the requested information, write the extracted values verbatim as plain text before your code block — for this task that text IS the deliverable and overrides the code-only response format — exactly as rendered on screen including units and punctuation, then emit done(). If the data spans multiple screens, scroll through all of it before finishing.",
  },
  {
    id: "cautious",
    label: "Cautious (non-destructive)",
    description: "Hard guardrails — refuses deletes, purchases, sends, and credential prompts.",
    instructions:
      "Operate in non-destructive mode. NEVER click buttons that delete, remove, purchase, pay, send, post, publish, or permanently change state — if completing the task requires one, stop and emit fail() explaining which action needs human approval. Never enter credentials, 2FA codes, or payment details even if a login wall appears: fail() and describe the prompt instead. Dismissing cookie banners and closing popups is allowed. When in doubt about whether an action is reversible, do not take it.",
  },
  {
    id: "fast-batch",
    label: "Fast batch mode",
    description: "High-volume repetitive steps on a stable UI — fewer verifications, more actions per turn.",
    instructions:
      "This is a repetitive batch task on a UI you have already seen. You may chain click field, type value, Tab in one step here: the usual one-state-change rule is relaxed on this stable UI. Skip re-verifying elements that were stable in previous screenshots. Still stop immediately if the screen layout changes unexpectedly, an error appears, or a click lands on the wrong element — batch speed never justifies compounding a mistake.",
  },
]

// ── Action executor mapping ─────────────────────────────────────────────────
//
// Every action_type the public API can return, with a faithful local
// execution for (a) a real desktop via pyautogui and (b) a browser page via
// Playwright. Pinned BOTH ways: tests/docs-local-automation.test.ts checks
// this table, and backend/tests/test_doc_examples.py pins the same list
// against the action bridge, so a new public action type cannot ship
// undocumented.
//
// Sign conventions (from the action bridge): scroll `clicks` keeps pyautogui
// semantics — positive scrolls UP, negative scrolls DOWN; `direction` is
// "vertical" (default) or "horizontal".

export interface ActionExecutorRow {
  actionType: string
  params: string
  pyautogui: string
  playwright: string
}

export const ACTION_EXECUTOR_MAP: ActionExecutorRow[] = [
  {
    actionType: "click",
    params: "x, y, button?=left, clicks?=1",
    pyautogui: 'pyautogui.click(x, y, clicks=p.get("clicks", 1), button=p.get("button", "left"))',
    playwright: 'page.mouse.click(x, y, { button, clickCount: p.clicks ?? 1 })',
  },
  {
    actionType: "move",
    params: "x, y",
    pyautogui: 'pyautogui.moveTo(x, y)',
    playwright: 'page.mouse.move(x, y)',
  },
  {
    actionType: "type_text",
    params: "text",
    pyautogui: 'pyautogui.write(p["text"], interval=0.02)',
    playwright: 'page.keyboard.type(p.text, { delay: 20 })',
  },
  {
    actionType: "key_press",
    params: "keys (list, pressed in order)",
    pyautogui: 'pyautogui.press(p["keys"])',
    playwright: 'for (const k of p.keys) await page.keyboard.press(mapKey(k))',
  },
  {
    actionType: "key_combo",
    params: "keys (held together)",
    pyautogui: 'pyautogui.hotkey(*p["keys"])',
    playwright: 'page.keyboard.press(p.keys.map(mapKey).join("+"))',
  },
  {
    actionType: "scroll",
    params: "clicks (+up / −down), direction?=vertical, x?, y?",
    pyautogui: 'pyautogui.scroll(p["clicks"]) — or pyautogui.hscroll() for horizontal',
    playwright: 'page.mouse.wheel(0, -p.clicks * 120)',
  },
  {
    actionType: "drag",
    params: "x1, y1, x2, y2, button?",
    pyautogui: 'pyautogui.moveTo(x1, y1); pyautogui.dragTo(x2, y2, duration=0.4)',
    playwright: 'page.mouse.move(x1, y1); page.mouse.down(); page.mouse.move(x2, y2); page.mouse.up()',
  },
  {
    actionType: "wait",
    params: "seconds",
    pyautogui: 'time.sleep(p["seconds"])',
    playwright: 'await page.waitForTimeout(p.seconds * 1000)',
  },
  {
    actionType: "done",
    params: "—",
    pyautogui: "task finished — stop the loop",
    playwright: "task finished — stop the loop",
  },
  {
    actionType: "fail",
    params: "—",
    pyautogui: "agent is blocked — stop and inspect `reasoning`",
    playwright: "agent is blocked — stop and inspect `reasoning`",
  },
  {
    actionType: "raw",
    params: "code (pyautogui source)",
    pyautogui: "fallback: log it; exec only if you trust the sandbox",
    playwright: "fallback: log it (browser targets should never exec it)",
  },
]

// ── Code snippets ───────────────────────────────────────────────────────────

export type LocalAutomationLang = "python" | "javascript" | "curl" | "go"

/** The canonical full agent loop on the USER'S OWN desktop. */
const PY_LOCAL_LOOP = `# Automate YOUR screen — no VM needed. pip install requests mss pyautogui pillow
import base64, io, time, uuid, requests, mss, pyautogui
from PIL import Image

API, KEY = "https://coasty.ai/v1", "sk-coasty-test-..."  # test key = free while you build
HDRS = {"X-API-Key": KEY}
pyautogui.FAILSAFE = True          # slam the mouse into a corner to abort instantly

REAL_W, REAL_H = pyautogui.size()  # your actual desktop resolution
SEND_W, SEND_H = 1280, 720         # what we tell the model (SD = 1 credit cheaper)
SX, SY = REAL_W / SEND_W, REAL_H / SEND_H   # scale model coords -> real pixels

def screenshot_b64():
    with mss.mss() as sct:
        shot = sct.grab(sct.monitors[1])                      # primary monitor
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        img = img.resize((SEND_W, SEND_H))                    # MUST match screen_width/height
        buf = io.BytesIO(); img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

def execute(a):
    t, p = a["action_type"], a["params"]
    if t == "click":
        pyautogui.click(p["x"] * SX, p["y"] * SY,
                        clicks=p.get("clicks", 1), button=p.get("button", "left"))
    elif t == "type_text":  pyautogui.write(p["text"], interval=0.02)
    elif t == "key_press":  pyautogui.press(p["keys"])
    elif t == "key_combo":  pyautogui.hotkey(*p["keys"])
    elif t == "scroll":     pyautogui.scroll(p["clicks"])     # +up / -down, like pyautogui
    elif t == "drag":
        pyautogui.moveTo(p["x1"] * SX, p["y1"] * SY)
        pyautogui.dragTo(p["x2"] * SX, p["y2"] * SY, duration=0.4)
    elif t == "wait":       time.sleep(p["seconds"])
    return t

# A session keeps screenshot history so the model remembers what it already did.
sess = requests.post(f"{API}/sessions", headers=HDRS, json={
    "cua_version": "v3",
    "screen_width": SEND_W, "screen_height": SEND_H,
    # Optional best-practice steering (Starter+). Pick a preset from the docs:
    "instructions": "Click the visual center of elements. If the target is not visible, scroll toward it, never guess.",
}).json()
sid = sess["session_id"]

task = "Open the calculator and compute 42 * 17"
try:
    for step in range(25):
        r = requests.post(
            f"{API}/sessions/{sid}/predict",
            headers={**HDRS, "Idempotency-Key": f"step-{sid}-{step}-{uuid.uuid4().hex[:8]}"},
            json={"screenshot": screenshot_b64(), "instruction": task},
            timeout=120,
        ).json()
        print(f"step {r['step']}: {r['reasoning'][:80]}")
        for a in r["actions"]:
            if execute(a) in ("done", "fail"):
                raise SystemExit(f"finished: {r['status']} — {r['reasoning']}")
        time.sleep(0.5)                                       # let the UI settle
finally:
    requests.delete(f"{API}/sessions/{sid}", headers=HDRS)    # stop the session clock
`

/** Browser-as-the-screen via Playwright — fixed viewport, no coordinate scaling. */
const JS_LOCAL_LOOP = `// Automate any BROWSER page — Playwright is the screen. npm i playwright
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";

const API = "https://coasty.ai/v1";
const HDRS = { "X-API-Key": "sk-coasty-test-...", "Content-Type": "application/json" };

// Fixed 1280x720 viewport == screen_width/height -> coordinates map 1:1. No scaling.
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("https://example.com");

const KEYMAP = { enter: "Enter", tab: "Tab", esc: "Escape", ctrl: "Control",
                 alt: "Alt", shift: "Shift", cmd: "Meta", win: "Meta",
                 backspace: "Backspace", delete: "Delete", space: " " };
const mapKey = (k) => KEYMAP[k.toLowerCase()] ?? (k.length === 1 ? k : k[0].toUpperCase() + k.slice(1));

async function execute(a) {
  const p = a.params;
  switch (a.action_type) {
    case "click":     await page.mouse.click(p.x, p.y, { button: p.button ?? "left", clickCount: p.clicks ?? 1 }); break;
    case "type_text": await page.keyboard.type(p.text, { delay: 20 }); break;
    case "key_press": for (const k of p.keys) await page.keyboard.press(mapKey(k)); break;
    case "key_combo": await page.keyboard.press(p.keys.map(mapKey).join("+")); break;
    case "scroll":    await page.mouse.wheel(0, -p.clicks * 120); break;   // API: +clicks = up
    case "drag":      await page.mouse.move(p.x1, p.y1); await page.mouse.down();
                      await page.mouse.move(p.x2, p.y2); await page.mouse.up(); break;
    case "wait":      await page.waitForTimeout(p.seconds * 1000); break;
  }
  return a.action_type;
}

const sess = await (await fetch(\`\${API}/sessions\`, {
  method: "POST", headers: HDRS,
  body: JSON.stringify({ cua_version: "v3", screen_width: 1280, screen_height: 720 }),
})).json();

const task = "Accept cookies if asked, then find the pricing page and read the cheapest plan";
let status = "continue";
for (let step = 0; step < 25 && status === "continue"; step++) {
  const screenshot = (await page.screenshot({ type: "png" })).toString("base64");
  const r = await (await fetch(\`\${API}/sessions/\${sess.session_id}/predict\`, {
    method: "POST",
    headers: { ...HDRS, "Idempotency-Key": \`step-\${sess.session_id}-\${step}-\${randomUUID()}\` },
    body: JSON.stringify({ screenshot, instruction: task }),
  })).json();
  console.log(\`step \${r.step}:\`, r.reasoning?.slice(0, 80));
  for (const a of r.actions) await execute(a);
  status = r.status;
}
await fetch(\`\${API}/sessions/\${sess.session_id}\`, { method: "DELETE", headers: HDRS });
await browser.close();
`

/** Single-shot: one screenshot in, actions out — works from any shell. */
const CURL_LOCAL = `# One-shot: send ANY screenshot (here: a local file), get actions back.
# macOS:  screencapture -x shot.png      Linux:  import -window root shot.png
# Windows (PowerShell): see the Python loop — or use any screenshot tool.
curl -s https://coasty.ai/v1/predict \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: local-demo-001" \\
  -d "{
    \\"screenshot\\": \\"$(base64 -w0 shot.png 2>/dev/null || base64 -i shot.png)\\",
    \\"instruction\\": \\"Click the Save button\\",
    \\"screen_width\\": 1280,
    \\"screen_height\\": 720
  }"
# -> { "actions": [ { "action_type": "click", "params": { "x": 1085, "y": 143, "button": "left" } } ], ... }
# Execute however you like: pyautogui, xdotool, AppleScript, nut-js, robotgo.
`

/** Go: native screenshot + single predict + robotgo execution sketch. */
const GO_LOCAL = `// go get github.com/kbinani/screenshot github.com/go-vgo/robotgo
package main

import (
    "bytes" ; "encoding/base64" ; "encoding/json" ; "fmt" ; "image/png" ; "net/http"
    "github.com/go-vgo/robotgo"
    "github.com/kbinani/screenshot"
)

func main() {
    img, _ := screenshot.CaptureDisplay(0)              // your real screen
    var buf bytes.Buffer
    png.Encode(&buf, img)
    body, _ := json.Marshal(map[string]any{
        "screenshot":    base64.StdEncoding.EncodeToString(buf.Bytes()),
        "instruction":   "Click the Save button",
        "screen_width":  img.Bounds().Dx(),             // full-res: coords map 1:1 (+1 credit if >1280x720)
        "screen_height": img.Bounds().Dy(),
    })
    req, _ := http.NewRequest("POST", "https://coasty.ai/v1/predict", bytes.NewReader(body))
    req.Header.Set("X-API-Key", "sk-coasty-test-...")
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Idempotency-Key", "go-local-demo-001")
    resp, _ := http.DefaultClient.Do(req)
    var out struct {
        Actions []struct {
            ActionType string                 \`json:"action_type"\`
            Params     map[string]any         \`json:"params"\`
        } \`json:"actions"\`
    }
    json.NewDecoder(resp.Body).Decode(&out)
    for _, a := range out.Actions {
        if a.ActionType == "click" {
            robotgo.Click(int(a.Params["x"].(float64)), int(a.Params["y"].(float64)))
        }
        fmt.Println(a.ActionType, a.Params)
    }
}
`

export const LOCAL_AUTOMATION_SNIPPETS: Record<LocalAutomationLang, string> = {
  python: PY_LOCAL_LOOP,
  javascript: JS_LOCAL_LOOP,
  curl: CURL_LOCAL,
  go: GO_LOCAL,
}

// ── The pitfalls every integration hits (rendered as callouts in both docs) ─

export const COORDINATE_SCALING_NOTE =
  "Coordinates come back in the SAME space as the screenshot you sent. If you downscale " +
  "(e.g. a 2560x1440 desktop resized to 1280x720 to save a credit), multiply returned x/y " +
  "by your scale factor before clicking — and pass the DOWNSCALED size as screen_width/height. " +
  "Sending full resolution with the real width/height also works (coordinates map 1:1) and " +
  "costs +1 credit above 1280x720. Mismatched screenshot vs screen_width/height is the " +
  "number-one cause of \"it clicks the wrong place\"."

export const LOCAL_SAFETY_NOTE =
  "You are giving a model control of a real mouse and keyboard. Keep pyautogui.FAILSAFE on " +
  "(mouse to a corner aborts), run with a step cap, send an Idempotency-Key on every predict " +
  "so a network retry can never double-execute a step, and use the 'Cautious (non-destructive)' " +
  "preset when the screen can reach anything irreversible."
