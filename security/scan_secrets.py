#!/usr/bin/env python3
"""SpecWATT secret scanner — working tree and full git history.

High-signal, low-noise pattern scan. Findings are printed with MASKED values
(first 3 characters only) so this tool is safe to run in public CI logs.
Exit codes: 0 = clean (allowlisted hits excluded), 1 = findings need review,
2 = usage error.

Usage:
    python security/scan_secrets.py            # tracked files in worktree
    python security/scan_secrets.py --history  # every blob of every commit
"""
import argparse
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

PATTERNS = [
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b")),
    ("github-fine-grained", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{60,}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("openai-style-key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("private-key-block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("generic-assignment", re.compile(
        r"\b(?:api[_-]?key|secret|passwd|password|auth[_-]?token|access[_-]?token)"
        r"\b[\"']?\s*[:=]\s*[\"'][^\"']{8,}[\"']", re.IGNORECASE)),
]

# Literal value snippets that are known test fixtures or documentation
# examples. Each entry needs a reason; keep this list minimal and audited.
ALLOWLIST = [
    ("generic-assignment", "correct-horse-battery", "security suite fixture password"),
    ("generic-assignment", "test-password-123", "existing backend test fixture"),
    ("generic-assignment", "wrong-password-123", "existing backend test fixture"),
    ("generic-assignment", "secretXY", "upstream backend test fixture (rejected sample)"),
    ("generic-assignment", "password-1234", "mobile client test fixture (api.test.mjs)"),
    ("generic-assignment", "valid-token-string-12345",
     "mobile client test fixture (fake token)"),
    ("generic-assignment", "password.", "documentation prose, not an assignment"),
    ("generic-assignment", "password: ''", "empty example value"),
]

# Files whose contents are third-party registries or lockfiles; they are still
# scanned for high-signal token patterns but generic assignments there are noise.
GENERIC_SKIP_GLOBS = ["*package-lock.json"]

MAX_FILE_BYTES = 2_000_000


def mask(match_text):
    return match_text[:3] + "***" if len(match_text) > 3 else "***"


def allowlisted(pattern_id, match_text):
    for list_id, snippet, _reason in ALLOWLIST:
        if list_id == pattern_id and snippet in match_text:
            return True
    return False


def scan_text(text, source, generic_skip=False):
    findings = []
    for pattern_id, pattern in PATTERNS:
        if pattern_id == "generic-assignment" and generic_skip:
            continue
        for match in pattern.finditer(text):
            if allowlisted(pattern_id, match.group(0)):
                continue
            findings.append((pattern_id, source, mask(match.group(0))))
    return findings


def scan_worktree():
    tracked = subprocess.run(
        ["git", "ls-files", "-z"], cwd=REPO, capture_output=True, check=True
    ).stdout.decode("utf-8").split("\0")
    findings = []
    for name in tracked:
        if not name:
            continue
        path = REPO / name
        if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, ValueError):
            continue  # binary
        generic_skip = any(
            fnmatch.fnmatch(name, pattern) for pattern in GENERIC_SKIP_GLOBS
        )
        findings.extend(scan_text(text, name, generic_skip=generic_skip))
    return findings


def to_posix(pattern):
    """git grep -E speaks POSIX ERE: drop Python's non-capturing group syntax."""
    return pattern.replace("(?:", "(")


def scan_history():
    commits = subprocess.run(
        ["git", "rev-list", "--all"], cwd=REPO, capture_output=True, check=True
    ).stdout.decode("utf-8").split()
    findings = []
    for commit in commits:
        for pattern_id, pattern in PATTERNS:
            result = subprocess.run(
                ["git", "grep", "-I", "-n", "-E", "-i", to_posix(pattern.pattern),
                 commit, "--"],
                cwd=REPO, capture_output=True,
            )
            if result.returncode != 0:
                continue  # 1 = no match in this commit
            for line in result.stdout.decode("utf-8", "replace").splitlines():
                # Format: <commit>:<path>:<lineno>:<content>
                parts = line.split(":", 3)
                if len(parts) != 4:
                    continue
                content = parts[3]
                if allowlisted(pattern_id, content):
                    continue
                findings.append((pattern_id, f"{commit[:12]}:{parts[1]}:{parts[2]}",
                                 mask(content.strip()[:60])))
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true",
                        help="scan every commit instead of the worktree")
    args = parser.parse_args()

    findings = scan_history() if args.history else scan_worktree()
    if findings:
        print(f"SECRET SCAN: {len(findings)} finding(s) need review:\n")
        for pattern_id, source, masked in findings:
            print(f"  [{pattern_id}] {source} -> {masked}")
        print("\nValues are masked. Verify each hit privately; never paste a "
              "real secret into issues or PRs. Rotate any confirmed secret and "
              "remember: removing a file from a new commit does not unpublish "
              "it from history.")
        return 1
    print("SECRET SCAN: clean"
          + (" (full history)" if args.history else " (tracked worktree files)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
