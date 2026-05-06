<div align="center">

<img src="assets/coasty.png" alt="Coasty" width="120"/>

<br />

# Open Computer Use

**AI agents that control computers like humans do.**

Browser automation · Terminal access · Desktop control · Multi-agent orchestration

<br />

[Website](https://coasty.ai) · [Discord](https://discord.gg/gppEfsVt) · [Twitter](https://x.com/llmhub_dev)

<br />

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

</div>

<br />

---

<br />

## See it in action

<table>
<tr>
<td align="center" width="50%">
<a href="https://www.youtube.com/watch?v=icxgLDephHE">
<img src="https://img.youtube.com/vi/icxgLDephHE/maxresdefault.jpg" alt="Marketing on Reddit" width="100%"/>
</a>
<br />
<strong>Marketing</strong> — Market your product on Reddit autonomously
<br />
<a href="https://coasty.ai/share/373c1f67-afec-4bd6-adda-3809ecdbdd75"><sub>View chat session</sub></a>
</td>
<td align="center" width="50%">
<a href="https://www.youtube.com/watch?v=qTvmGfg3HVw">
<img src="https://img.youtube.com/vi/qTvmGfg3HVw/maxresdefault.jpg" alt="Go-to-Market Outreach" width="100%"/>
</a>
<br />
<strong>Go-to-Market</strong> — Find prospects and send personalized emails
<br />
<a href="https://coasty.ai/share/425d3c49-3a06-41e5-9859-aa00c5b12f3d"><sub>View chat session</sub></a>
</td>
</tr>
<tr>
<td align="center">
<a href="https://www.youtube.com/watch?v=Wbo2o74hVIo">
<img src="https://img.youtube.com/vi/Wbo2o74hVIo/maxresdefault.jpg" alt="QA Testing" width="100%"/>
</a>
<br />
<strong>QA Testing</strong> — Test every checkout flow and report bugs
<br />
<a href="https://coasty.ai/share/7ee3e942-c5dd-4e49-93b6-353bb5273b7e"><sub>View chat session</sub></a>
</td>
<td align="center">
<a href="https://www.youtube.com/watch?v=mH-csaCa508">
<img src="https://img.youtube.com/vi/mH-csaCa508/maxresdefault.jpg" alt="Job Application" width="100%"/>
</a>
<br />
<strong>Job Application</strong> — Find roles, tailor your resume, and apply
<br />
<a href="https://coasty.ai/share/4ac6f3d2-c273-4a07-bf98-b986d1cbfb88"><sub>View chat session</sub></a>
</td>
</tr>
<tr>
<td align="center">
<a href="https://www.youtube.com/watch?v=AnHJuRMLCnE">
<img src="https://img.youtube.com/vi/AnHJuRMLCnE/maxresdefault.jpg" alt="Form Filling" width="100%"/>
</a>
<br />
<strong>Form Filling</strong> — Fill out the YC S26 application for you
<br />
<a href="https://coasty.ai/share/60a0722b-fb98-43d6-a4e7-951d80a22363"><sub>View chat session</sub></a>
</td>
<td align="center">
<a href="https://www.youtube.com/watch?v=A_OvNh51Npg">
<img src="https://img.youtube.com/vi/A_OvNh51Npg/maxresdefault.jpg" alt="Social Media" width="100%"/>
</a>
<br />
<strong>Social Media</strong> — Post on Hacker News and engage with comments
<br />
<a href="https://coasty.ai/share/d181de46-b41d-4b87-9648-0374b2b7ec1c"><sub>View chat session</sub></a>
</td>
</tr>
</table>

<br />

---

<br />

## What is this?

Open Computer Use is an open-source platform that gives AI agents real computer control. Unlike chatbots that only *talk* about tasks, agents here **actually perform them** — browsing the web, running commands, clicking through UIs, and orchestrating multi-step workflows in isolated containers.

> Computer use capabilities similar to Anthropic's Claude Computer Use, but fully open-source and extensible.

<br />

---

<br />

## Agents

**Browser** — Search-first web navigation, form filling, element interaction, multi-tab management, screenshot capture.

**Terminal** — Command execution, file operations, script running, package management, output streaming.

**Desktop** — Mouse & keyboard control, window management, screenshot analysis, UI element detection via computer vision.

**Planner** — Decomposes complex requests into subtasks, assigns to specialized agents, passes context between steps.

<br />

---

<br />

## Architecture

```
Frontend (Next.js 15)         Backend (FastAPI)              VM (Docker)
┌──────────────────┐     ┌─────────────────────────┐     ┌──────────────────┐
│  Chat UI         │────▶│  Multi-Agent Executor    │────▶│  Chrome Browser  │
│  Model Selector  │ SSE │  ├─ Planner Agent        │ WS  │  Terminal        │
│  VM Management   │◀────│  ├─ Browser Agent        │◀────│  Desktop (XFCE)  │
│  Zustand Stores  │     │  ├─ Terminal Agent       │     │  Agent Server    │
└──────────────────┘     │  └─ Desktop Agent        │     │  VNC :5900       │
                         │  WebSocket · DB · Billing│     └──────────────────┘
                         └─────────────────────────┘
```

<br />

---

<br />

## Quick Start

You only need **one API key** to run the app. Get a free sandbox key at [coasty.ai/developers](https://coasty.ai/developers) — sandbox keys (`sk-coasty-test-*`) return mock infrastructure for free; live keys provision real VMs.

```bash
git clone https://github.com/coasty-ai/open-computer-use.git
cd open-computer-use
npm install
cp .env.oss.example .env.local
```

Open `.env.local` and paste your key:

```env
COASTY_API_KEY=sk-coasty-test-your-key-here
```

Then:

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** and start a chat. That's it — no Supabase, no AWS, no Stripe to configure.

> First boot auto-generates `CSRF_SECRET` and `ENCRYPTION_KEY` into `.env.local` (already gitignored). Safe to delete; we'll regenerate.

<details>
<summary><strong>Want the full self-hosted stack?</strong> (Supabase + AWS Bedrock + Stripe)</summary>

<br />

You'll need:

- A [Supabase](https://supabase.com) project
- AWS credentials with [Bedrock model access enabled](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) in your region
- Optional: Stripe keys for billing UI, Google Custom Search keys for the web-search tool

### 1. Install backend deps

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. Set environment variables

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env
```

Required in **both** `.env.local` and `backend/.env`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key

# Security — generate each with: openssl rand -hex 32 (or base64 32 for ENCRYPTION_KEY)
ENCRYPTION_KEY=
CSRF_SECRET=
INTERNAL_API_KEY=          # MUST match in both files
```

Required only in **`backend/.env`**:

```env
# AWS Bedrock (LLM)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
BEDROCK_DEFAULT_MODEL=anthropic.claude-sonnet-4-20250514-v1:0

# Optional: web-search tool
GOOGLE_SEARCH_KEY=
GOOGLE_SEARCH_CX=
```

> Bedrock requires per-model access enablement in the AWS console. See [AWS docs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).

### 3. Set up the database

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Or paste `supabase/schema.sql` into the Supabase SQL Editor.

### 4. Run

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend (dev)
cd backend && python main.py

# Terminal 3 — Optional: local AI desktop VM
docker-compose -f docker-compose.ai-desktop.yml up --build
```

Or all together:

```bash
docker-compose up --build
```

Open **[http://localhost:3000](http://localhost:3000)** and sign in.

</details>

<details>
<summary><strong>Prefer the MCP server?</strong></summary>

<br />

The same `COASTY_API_KEY` works with [`@coasty/mcp`](https://www.npmjs.com/package/@coasty/mcp), an npm package that gives Claude Desktop / Cursor / Windsurf full computer-use tools over MCP.

```bash
npx @coasty/mcp
```

See [`mcp/`](./mcp) for details.

</details>

<br />

---

<br />

## Tech Stack

| Layer | Technologies |
| --- | --- |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI, Zustand, Vercel AI SDK |
| **Backend** | FastAPI, Python 3.10+, WebSockets, asyncio, uvicorn |
| **AI Providers** | OpenAI, Anthropic, Google, Azure, xAI, Mistral, Perplexity, OpenRouter |
| **Infrastructure** | Docker, Ubuntu 22.04 + XFCE, Chrome, Selenium, Supabase, Stripe |
| **Desktop App** | Electron 40, Puppeteer-core, platform-native automation (Win32 / CoreGraphics / xdotool) |

<br />

---

<br />

## Electron Desktop App

A lightweight overlay that runs AI agent commands directly on your local machine instead of a remote VM.

- Floating always-on-top pill UI with expanded chat panel
- Platform-native automation (PowerShell/Win32 on Windows, CoreGraphics/osascript on macOS, xdotool on Linux)
- Browser control via Puppeteer-core, shell execution, file operations
- WebSocket bridge to backend with auto-reconnect

```bash
cd electron
npm install
npm run dev        # Development with hot reload
npm run package    # Build for current platform
```

<br />

---

<br />

## Project Structure

```
├── app/                    # Next.js routes & pages
├── components/             # React components (UI, chat, prompts)
├── lib/                    # Stores, providers, services, utilities
├── backend/
│   └── app/
│       ├── api/routes/     # FastAPI endpoints
│       ├── services/       # Multi-agent executor, VM control, billing
│       ├── providers/      # AI provider integrations
│       └── core/           # Config, middleware, logging
├── electron/
│   └── src/
│       ├── main/           # App lifecycle, IPC, automation modules
│       ├── preload/        # Context bridge API
│       └── renderer/       # React UI, stores, components
├── docker/ai-desktop/      # Ubuntu VM container
└── supabase/               # Database schema
```

<br />

---

<br />

## Contributing

1. Fork the repo
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes
4. Open a pull request

Bug reports and feature requests welcome in [Issues](https://github.com/coasty-ai/open-computer-use/issues).

<br />

---

<br />

## Roadmap

- [ ] Multi-VM parallel orchestration
- [ ] Visual workflow builder
- [ ] Agent marketplace & templates
- [ ] Windows / macOS VM support
- [ ] Plugin system for custom tools
- [ ] Collaborative sessions
- [ ] Voice control & video understanding

<br />

---

<br />

## Responsible Use

This platform gives AI agents significant autonomy. Use it to automate repetitive tasks, testing, research, and content creation — not to violate terms of service, spam, or scrape without permission. Always use isolated environments, respect `robots.txt`, and follow data protection laws.

<br />

---

<br />

## License

[Apache License 2.0](LICENSE) — Copyright (c) 2025 Open Computer Use Contributors

<br />

---

<br />

<div align="center">

**[Star on GitHub](https://github.com/coasty-ai/open-computer-use)** · **[Join Discord](https://discord.gg/gppEfsVt)** · **[Follow on X](https://x.com/llmhub_dev)**

<br />

[![Star History](https://api.star-history.com/svg?repos=coasty-ai/open-computer-use&type=Date)](https://star-history.com/#coasty-ai/open-computer-use&Date)

</div>
