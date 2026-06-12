<div align="center">

# Open Computer Use

**AI agents that control computers like humans do.**

Browser automation · Terminal access · Desktop control · Multi-agent orchestration

<br />

<img src="public/demo-screenshot.png" alt="Coasty agents running on a real desktop" width="760" />

<br />
<br />

[Website](https://coasty.ai) · [Get an API key](https://coasty.ai/developers) · [Discord](https://discord.gg/gppEfsVt) · [X](https://x.com/llmhub_dev)

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

</div>

<br />

---

<br />

## What is this?

Open Computer Use is an open-source platform that gives AI agents real computer control. Unlike chatbots that only *talk* about tasks, agents here **actually perform them**: browsing the web, running commands, clicking through UIs, and orchestrating multi-step workflows.

> Computer-use capabilities similar to Anthropic's Claude Computer Use, but fully open-source and extensible.

<br />

---

<br />

## Quick Start

Coasty runs in OSS mode with a **single API key**. The whole setup is four steps and takes a couple of minutes.

### 1. Get your free API key

1. Go to **[coasty.ai/developers](https://coasty.ai/developers)**.
2. Sign in (it's free, no credit card needed).
3. Create an API key. It looks like `sk-coasty-test-…`.
4. Copy it. You'll paste it in step 3.

### 2. Clone and install

**Prerequisites:** Node.js `^20.19.0 || >=22.12.0` (the repo's `.nvmrc` pins `22`) and npm. No compiler is needed; a wall of `ssh2` node-gyp warnings during install is harmless.

```bash
git clone https://github.com/coasty-ai/open-computer-use.git
cd open-computer-use
npm install
```

### 3. Add your key

```bash
cp .env.oss.example .env.local
```

> On Windows, `cp` works in PowerShell. In `cmd.exe`, use `copy .env.oss.example .env.local`.

Open `.env.local` and paste the key from step 1:

```env
COASTY_API_KEY=sk-coasty-test-your-key-here
```

### 4. Run

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. The app boots straight into the chat workspace. `CSRF_SECRET` and `ENCRYPTION_KEY` are generated into `.env.local` automatically on first boot, so there is nothing else to configure.

<br />

> [!NOTE]
> **What works today.** In OSS mode the chat workspace runs locally and your key powers the public [`/v1` REST API](https://coasty.ai/api-docs) (predict, sessions, machines, runs, workflows, schedules) and the [MCP server](#mcp-server). Sending an in-app chat message currently returns a clear `501`: coasty.ai does not yet expose a public chat endpoint (`/v1/chat` is in progress). The full agent stack ("production mode") needs services this repo does not include (a Python backend, Supabase, Stripe, AWS) and runs the hosted product at [coasty.ai](https://coasty.ai). OSS mode is the path for working on this codebase.

<br />

---

<br />

## Agents

| Agent | What it does |
| --- | --- |
| **Browser** | Search-first web navigation, form filling, element interaction, multi-tab management, screenshots. |
| **Terminal** | Command execution, file operations, script running, package management, output streaming. |
| **Desktop** | Mouse and keyboard control, window management, screenshot analysis, UI detection via computer vision. |
| **Planner** | Decomposes complex requests into subtasks, assigns them to specialized agents, passes context between steps. |

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
<strong>Marketing</strong>: Market your product on Reddit autonomously
<br />
<a href="https://coasty.ai/share/373c1f67-afec-4bd6-adda-3809ecdbdd75"><sub>View chat session</sub></a>
</td>
<td align="center" width="50%">
<a href="https://www.youtube.com/watch?v=qTvmGfg3HVw">
<img src="https://img.youtube.com/vi/qTvmGfg3HVw/maxresdefault.jpg" alt="Go-to-Market Outreach" width="100%"/>
</a>
<br />
<strong>Go-to-Market</strong>: Find prospects and send personalized emails
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
<strong>QA Testing</strong>: Test every checkout flow and report bugs
<br />
<a href="https://coasty.ai/share/7ee3e942-c5dd-4e49-93b6-353bb5273b7e"><sub>View chat session</sub></a>
</td>
<td align="center">
<a href="https://www.youtube.com/watch?v=mH-csaCa508">
<img src="https://img.youtube.com/vi/mH-csaCa508/maxresdefault.jpg" alt="Job Application" width="100%"/>
</a>
<br />
<strong>Job Application</strong>: Find roles, tailor your resume, and apply
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
<strong>Form Filling</strong>: Fill out the YC S26 application for you
<br />
<a href="https://coasty.ai/share/60a0722b-fb98-43d6-a4e7-951d80a22363"><sub>View chat session</sub></a>
</td>
<td align="center">
<a href="https://www.youtube.com/watch?v=A_OvNh51Npg">
<img src="https://img.youtube.com/vi/A_OvNh51Npg/maxresdefault.jpg" alt="Social Media" width="100%"/>
</a>
<br />
<strong>Social Media</strong>: Post on Hacker News and engage with comments
<br />
<a href="https://coasty.ai/share/d181de46-b41d-4b87-9648-0374b2b7ec1c"><sub>View chat session</sub></a>
</td>
</tr>
</table>

<br />

---

<br />

## Desktop App

A lightweight overlay that runs AI agent commands directly on your local machine. Native automation on Windows, macOS, and Linux, with a floating always-on-top pill UI and an expanded chat panel.

```bash
cd electron
npm install
npm run dev
```

This launches the overlay window. Without an `electron/.env` file the app starts on the auth screen with a visible "Supabase is not configured" state. To sign in and chat you need `electron/.env` (`cp .env.example .env`) with Supabase credentials, plus a running backend at `COASTY_BACKEND_URL` (default `http://localhost:8001`, not included in this repo).

See **[electron/README.md](./electron/README.md)** for development, testing, packaging, and platform notes.

<br />

---

<br />

## MCP Server

Use the same API key with Claude Desktop, Cursor, or Windsurf via MCP:

```bash
npx @coasty/mcp
```

See **[mcp/](./mcp)** for details.

<br />

---

<br />

## Contributing

The default branch is `production`: branch from it, and open your pull request against it.

1. Fork the repo
2. Create a branch from `production`: `git checkout -b feature/your-feature`
3. Commit your changes
4. Open a pull request targeting `production`

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, testing, and review details. Bug reports and feature requests are welcome in [Issues](https://github.com/coasty-ai/open-computer-use/issues).

<br />

---

<br />

## Roadmap

- [ ] Multi-VM parallel orchestration
- [ ] Visual workflow builder
- [ ] Agent marketplace and templates
- [ ] Plugin system for custom tools
- [ ] Collaborative sessions
- [ ] Voice control and video understanding

<br />

---

<br />

## Responsible Use

This platform gives AI agents significant autonomy. Use it to automate repetitive tasks, testing, research, and content creation, not to violate terms of service, spam, or scrape without permission. Always use isolated environments, respect `robots.txt`, and follow data protection laws.

<br />

---

<br />

## License

[Apache License 2.0](LICENSE), Copyright (c) 2025 Open Computer Use Contributors. One exception: the [`mcp/`](./mcp) subpackage is published to npm under the MIT license and carries its own [`mcp/LICENSE`](./mcp/LICENSE).

<br />

---

<br />

<div align="center">

**[Star on GitHub](https://github.com/coasty-ai/open-computer-use)** · **[Join Discord](https://discord.gg/gppEfsVt)** · **[Follow on X](https://x.com/llmhub_dev)**

<br />

[![Star History](https://api.star-history.com/svg?repos=coasty-ai/open-computer-use&type=Date)](https://star-history.com/#coasty-ai/open-computer-use&Date)

</div>
