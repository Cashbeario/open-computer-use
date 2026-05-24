#!/usr/bin/env python3
"""
CI guard: fail the build if any tracked source file contains a JWT-shaped
literal string.

This catches:
- Test fixtures with hard-coded JWTs (use 'INVALID.JWT.TOKEN' instead)
- Accidentally pasted production tokens
- Logger format strings that would print JWTs verbatim

Allows:
- Comments containing the regex itself (this file is allowlisted)
- README/docs that explain the redaction (allowlisted via ALLOWLIST_PATHS)

Usage:
    python scripts/check_no_jwt_leak.py [--root .] [--changed-only]

Exit code 0 = clean; 1 = leak detected.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

JWT_REGEX = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")

ALLOWLIST_PATHS = {
    "scripts/check_no_jwt_leak.py",  # this file
    "backend/app/core/log_redaction.py",  # the redaction filter pattern
    "backend/tests/test_log_redaction.py",  # tests for the filter
    "backend/app/core/INCIDENT_2026-05-18_JWT_LEAK.md",  # incident doc
    "backend/app/core/LOG_REDACTION_IMPLEMENTATION.md",  # impl report
    # Pre-existing intentional fixture tokens — both files test that
    # JWT-shaped strings are rejected/redacted by the code under test, so
    # the literal must appear in the file by design.  Pinned to the exact
    # paths so the guard fails again the moment a NEW file shows up.
    "electron/src/main/error-reporter.test.ts",
    "tests/post_deploy/test_security_cors_csrf_extra.py",
    ".jwtleakignore",
}

SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "__pycache__", ".next",
    "dist", "build", "out", ".turbo", "coverage", ".pytest_cache",
    "OSWorld",  # vendored benchmark
}

INCLUDE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py",
    ".go", ".rs",
    ".json", ".yml", ".yaml", ".toml",
    ".md", ".txt",
    ".env", ".env.example", ".env.local",
    ".tf", ".tfvars",
}


def _is_git_repo(root: Path) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        capture_output=True, text=True, cwd=root,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def _git_tracked_files(root: Path):
    """Yield Paths for every git-tracked file under ``root``.

    Using ``git ls-files`` instead of an rglob walk means the scan matches
    what CI actually sees on ``actions/checkout`` — local-only secret files
    (.env, .tfvars, dv.env, pd.env) that are gitignored never get scanned,
    avoiding false-positive failures from real production secret blobs that
    live next to the repo but never ship.
    """
    result = subprocess.run(
        ["git", "ls-files"],
        capture_output=True, text=True, cwd=root,
    )
    for line in result.stdout.splitlines():
        p = root / line.strip()
        if p.is_file():
            yield p


def iter_files(root: Path, changed_only: bool):
    if changed_only:
        # Use git diff to limit scan; covers PR workflow.
        result = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=AM", "origin/main...HEAD"],
            capture_output=True, text=True, cwd=root,
        )
        candidates = (root / line.strip() for line in result.stdout.splitlines())
    elif _is_git_repo(root):
        # Scan tracked files only — matches CI checkout view.
        candidates = _git_tracked_files(root)
    else:
        # Non-git tree (e.g. unit-test tempdir): fall back to a filesystem
        # walk so the script is still useful in isolation.
        candidates = (p for p in root.rglob("*") if p.is_file())

    for p in candidates:
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix not in INCLUDE_EXTENSIONS:
            continue
        rel = str(p.relative_to(root)).replace("\\", "/")
        if rel in ALLOWLIST_PATHS:
            continue
        yield p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--changed-only", action="store_true")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    violations = []
    scanned = 0
    for path in iter_files(root, args.changed_only):
        scanned += 1
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for m in JWT_REGEX.finditer(content):
            line_no = content[:m.start()].count("\n") + 1
            sample = m.group(0)[:30] + "..."
            violations.append((path.relative_to(root), line_no, sample))

    if violations:
        print("\nJWT-leak guard failed:\n", file=sys.stderr)
        for p, ln, s in violations:
            print(f"  {p}:{ln}: {s}", file=sys.stderr)
        print(f"\n{len(violations)} JWT-shaped string(s) detected.", file=sys.stderr)
        print(
            "Fix: replace with 'INVALID.JWT.TOKEN' (test fixture) or rotate "
            "if accidental real token. Allowlist intentional patterns by "
            "adding the file to scripts/check_no_jwt_leak.py ALLOWLIST_PATHS.",
            file=sys.stderr,
        )
        return 1

    print(f"JWT-leak guard clean ({scanned} files scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
