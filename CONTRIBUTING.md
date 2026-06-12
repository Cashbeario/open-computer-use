# Contributing to Open Computer Use

First off, thank you for considering contributing to Open Computer Use! It's people like you that make this project such a great tool for the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Project Structure](#project-structure)
- [Testing Guidelines](#testing-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to fostering an open and welcoming environment. We pledge to make participation in our project and our community a harassment-free experience for everyone.

### Our Standards

**Examples of behavior that contributes to a positive environment:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Examples of unacceptable behavior:**
- The use of sexualized language or imagery
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the [existing issues](https://github.com/coasty-ai/open-computer-use/issues) to avoid duplicates. GitHub pre-fills new issues from the templates in `.github/`.

When you create a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, screenshots, logs)
- **Describe the behavior you observed** and what you expected to see
- **Include your environment details** (OS, Node.js version, Python version, browser)

**Bug Report Template:**

```markdown
**Description:**
A clear and concise description of the bug.

**Steps to Reproduce:**
1. Go to '...'
2. Click on '...'
3. Execute '...'
4. See error

**Expected Behavior:**
What you expected to happen.

**Actual Behavior:**
What actually happened.

**Environment:**
- OS: [e.g., Windows 11, macOS 14, Ubuntu 22.04]
- Node.js: [e.g., 20.10.0]
- Python: [e.g., 3.10.12]
- Browser: [e.g., Chrome 120]

**Screenshots/Logs:**
If applicable, add screenshots or logs.

**Additional Context:**
Any other relevant information.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the proposed feature
- **Explain why this enhancement would be useful** to most users
- **List any alternative solutions** you've considered
- **Include mockups or examples** if applicable

**Feature Request Template:**

```markdown
**Is your feature request related to a problem?**
A clear description of the problem. Ex. I'm always frustrated when [...]

**Describe the solution you'd like:**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered:**
Other solutions or features you've considered.

**Use Cases:**
Real-world scenarios where this feature would be valuable.

**Additional Context:**
Mockups, examples from other projects, etc.
```

### Contributing Code

We love code contributions! Here's how to get started:

1. **Find an issue to work on** or create a new one
2. **Comment on the issue** to let others know you're working on it
3. **Fork the repository** and create a branch from `production` (the default branch)
4. **Make your changes** following our coding standards
5. **Test thoroughly** - add tests if needed
6. **Submit a pull request** targeting `production` with a clear description

## Development Setup

### Prerequisites

- Node.js `^20.19.0 || >=22.12.0` (the repo's `.nvmrc` pins 22) and npm
- Git
- Python 3.10+ and Docker are only needed by maintainers with access to the private backend (`backend/` is not part of this public repository)

### Initial Setup (OSS mode)

This is the contributor path. All you need beyond Node is a free sandbox API key from [coasty.ai/developers](https://coasty.ai/developers).

1. **Clone your fork:**

```bash
git clone https://github.com/<your-username>/open-computer-use.git
cd open-computer-use
```

2. **Install dependencies:**

```bash
npm install
```

No compiler is required. A wall of `ssh2` node-gyp warnings during install is benign; the install still succeeds.

3. **Set up environment variables:**

```bash
cp .env.oss.example .env.local
# Windows cmd.exe: copy .env.oss.example .env.local
```

Open `.env.local` and set your key: `COASTY_API_KEY=sk-coasty-test-...`

`CSRF_SECRET` and `ENCRYPTION_KEY` are generated automatically into `.env.local` the first time the dev server boots, so you do not need to set them.

`.env.example` documents the full-stack configuration (Supabase, Stripe, AWS) used by the hosted deployment. You do not need it for OSS contributions.

4. **Start the dev server:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app boots into the chat workspace in OSS mode. Note: sending a chat message currently returns a clear 501 because coasty.ai does not yet expose a public chat endpoint (`/v1/chat` is in progress). The workspace UI, the public /v1 REST API, and the test suites all work with your key.

### Electron Desktop App

```bash
cd electron
npm install
npm run dev
```

See [electron/README.md](electron/README.md) for environment variables, testing, and packaging.

### Backend (maintainers only)

The Python FastAPI backend is not included in this public repository, so these steps apply only to maintainers with access to the private `backend/` tree:

```bash
cd backend
cp .env.example .env
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Making Changes

1. **Create a new branch from `production` (the default branch):**

```bash
git checkout production
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

2. **Make your changes** following our coding standards

3. **Check your changes:**

```bash
npm run type-check   # must pass
npm test             # must pass
```

`npm run lint` currently reports a large number of pre-existing errors and is not yet part of the contributor gate. Please avoid adding new lint errors in files you touch, but a clean lint run is not required to open a PR.

4. **Commit your changes:**

```bash
git add .
git commit -m "feat: add amazing feature"
# or
git commit -m "fix: resolve issue with XYZ"
```

**Commit Message Convention:**

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add multi-VM orchestration support
fix: resolve WebSocket reconnection issue
docs: update installation instructions
refactor: simplify agent executor logic
test: add tests for browser agent
```

## Pull Request Process

Pull requests target the `production` branch (the default branch).

1. **Update documentation** if needed (README, CLAUDE.md, etc.)
2. **Add or update tests** for your changes
3. **Ensure all tests pass** and code follows style guidelines
4. **Fill out the PR template** completely (GitHub pre-fills it from `.github/`)
5. **Request review** from maintainers

### Pull Request Template

```markdown
**Description:**
Brief description of changes.

**Related Issue:**
Fixes #(issue number)

**Type of Change:**
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

**How Has This Been Tested?**
Describe the tests you ran and how to reproduce them.

**Checklist:**
- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

**Screenshots (if applicable):**
Add screenshots to help explain your changes.
```

## Coding Standards

### Frontend (TypeScript/React)

- **TypeScript**: Use strict typing, avoid `any`
- **React**: Use functional components with hooks
- **Naming**:
  - Components: PascalCase (`ChatInterface.tsx`)
  - Functions/variables: camelCase (`getUserProfile`)
  - Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **File Structure**: Keep components small and focused
- **Imports**: Organize imports (React, external, internal)
- **Formatting**: Use Prettier (runs on save)

**Example:**

```typescript
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"

interface ChatMessageProps {
  message: string
  role: "user" | "assistant"
}

export function ChatMessage({ message, role }: ChatMessageProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  return (
    <div className={`message message-${role}`}>
      {message}
    </div>
  )
}
```

### Backend (Python)

- **Python**: Follow PEP 8 style guide
- **Type Hints**: Use type hints for function signatures
- **Docstrings**: Add docstrings to all public functions
- **Async**: Use async/await for I/O operations
- **Formatting**: Use Black for code formatting

**Example:**

```python
from typing import Dict, Optional, List
from pydantic import BaseModel

class TaskRequest(BaseModel):
    """Request model for task execution"""
    user_request: str
    context: Optional[str] = None

async def execute_task(
    task_id: str,
    request: TaskRequest,
    user_id: str
) -> Dict[str, Any]:
    """
    Execute a task with the multi-agent system.

    Args:
        task_id: Unique identifier for the task
        request: Task request with user input
        user_id: ID of the requesting user

    Returns:
        Dictionary containing task results

    Raises:
        ValueError: If task_id is invalid
        RuntimeError: If execution fails
    """
    # Implementation here
    pass
```

## Project Structure

Understanding the codebase layout:

```
open-computer-use/
├── app/                    # Next.js app directory
│   ├── c/[chatId]/        # Chat pages
│   ├── api/               # API routes
│   └── ...
├── backend/               # Python FastAPI backend (maintainers only; not in this public repo)
│   ├── app/
│   │   ├── api/routes/   # API endpoints
│   │   ├── services/     # Business logic
│   │   ├── models/       # Data models
│   │   └── core/         # Config, middleware
│   └── ...
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── common/           # Shared components
│   └── ...
├── lib/                   # Frontend utilities
│   ├── providers/        # AI providers
│   ├── stores/           # State management
│   └── ...
└── docker/               # Docker configurations
```

## Testing Guidelines

### Web Testing (Vitest)

We use [Vitest](https://vitest.dev/) (not Jest), with `@testing-library/react` where components are involved:

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run a single file
npx vitest run tests/path/to/file.test.ts
```

`npm test` passes on a fresh clone. Suites that depend on the private backend or its migrations detect that those files are missing and skip; they run in the maintainer tree.

**Example Test:**

```typescript
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ChatMessage } from "./ChatMessage"

describe("ChatMessage", () => {
  it("renders user message correctly", () => {
    render(
      <ChatMessage
        message="Hello, world!"
        role="user"
      />
    )

    expect(screen.getByText("Hello, world!")).toBeInTheDocument()
  })
})
```

### Web End-to-End Testing (Playwright)

```bash
# One-time browser download
npx playwright install chromium

# Run the e2e suite
npm run test:e2e
```

### Electron Testing

Electron unit tests run without any environment configuration or credentials:

```bash
cd electron
npm test
```

The Electron end-to-end tests (Playwright) need a build first:

```bash
cd electron
npm run build
npm run test:e2e
# or both in one step:
npm run test:e2e:build
```

### Full Suite and Backend Testing (maintainers only)

`npm run test:all` additionally runs the Python backend tests, so it needs Python, pytest, and the private `backend/` tree. It is not runnable on a public clone.

Backend tests use pytest:

```bash
cd backend

# Run all tests
pytest

# Run specific test file
pytest tests/test_agents.py

# Run with coverage
pytest --cov=app tests/
```

## Review Process

1. **Automated Checks**: GitHub Actions CI (`.github/workflows/ci.yml`) runs type-check and the unit test suites for both web and Electron on every PR targeting `production`. Lint is not part of the gate yet (the current lint output is known-noisy with pre-existing errors).
2. **Code Review**: At least one maintainer review required
3. **Testing**: Reviewer tests changes locally
4. **Feedback**: Address any requested changes
5. **Approval**: Maintainer approves and merges

**Review Timeline:**
- Initial review: Within 3-5 days
- Follow-up reviews: Within 1-2 days
- Urgent fixes: Within 24 hours

## Getting Help

- **Discord**: Join our [community server](https://discord.gg/gppEfsVt)
- **GitHub Discussions**: Ask questions or discuss ideas
- **Email**: For sensitive issues: founders@coasty.ai

## Recognition

All contributors will be:
- Listed in our [Contributors](https://github.com/coasty-ai/open-computer-use/graphs/contributors) page
- Mentioned in release notes for their contributions
- Part of our growing community!

---

Thank you for contributing to Open Computer Use! Your efforts help make AI automation accessible to everyone.
