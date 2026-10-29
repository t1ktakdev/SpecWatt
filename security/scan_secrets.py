#!/usr/bin/env python3
"""SpecWATT secret scanner — working tree and full git history.

High-signal, low-noise pattern scan. Findings are printed with MASKED values
(no matched characters) so this tool is safe to run in public CI logs.
Exit codes: 0 = clean (allowlisted hits excluded), 1 = findings need review,
2 = usage error.

Usage:
    python security/scan_secrets.py            # tracked files in worktree
    python security/scan_secrets.py --history  # every blob of every commit
"""
import argparse
import fnmatch
import hashlib
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
    ("generic-assignment", "leaked-secret-999", "synthetic rejected-input echo test"),
    ("generic-assignment", "whatever-pass-123", "synthetic invalid login fixture"),
    ("generic-assignment", "another-pass-12345", "synthetic duplicate registration fixture"),
    ("generic-assignment", "correct-horse", "synthetic malformed request fixture"),
    ("generic-assignment", "no-such-pass-1", "synthetic rate limit fixture"),
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

# First-run exceptions are NOT global value exemptions. Only the complete,
# audited source line at the exact repository path may suppress a generic hit.
# Any content/whitespace change, added credential, other path or high-signal
# pattern remains subject to scanning, in both current files and history.
AUDITED_SOURCE_LINES = {
    "mobile/specwatt-app/src/screens/server.tsx": frozenset({
        # React Native autoComplete and textContentType enum ternaries.
        "25137b4314db363e34ecd6ddc077cdd0f5e8e2ada2b2470c54b3682af9dba649",
        "4e70a2f6964e4839dc8d1736019d970604b2ec834aac667f5e144c261413a73f",
    }),
    "mobile/specwatt-app/tests/first-run-auth.test.mjs": frozenset({
        # Synthetic auth response fixture; never used by a real service.
        "892c757fc217b392501cd0f81fae441725291041670557ee1742446c0fb24373",
    }),
    "security/test_security_tools.py": frozenset({
        # Exact old test snippets in 0db8542/4de7daf: copies of the same two
        # JSX enums inside Python test strings, not credential assignments.
        "71b6866dfcfc3897464e0dada3c24d9963fb9532590302ee6d3e197bc302560a",
        "4fb8b7c4cb5f4a1421198b5780fb86a8f74bb9bd3226e089b1cf3d637aa59c30",
    }),
}


def audited_source_literal(pattern_id, path, line):
    return (
        pattern_id == "generic-assignment"
        and "\n" not in line
        and hashlib.sha256(line.encode("utf-8")).hexdigest()
        in AUDITED_SOURCE_LINES.get(path, ())
    )

# Files whose contents are third-party registries or lockfiles; they are still
# scanned for high-signal token patterns but generic assignments there are noise.
# Two individually audited *historical* versions of a synthetic e2e login
# password created only for a temporary loopback/SQLite fixture. It is NOT a
# service secret. Do not extend this to a filename glob or a substring prefix.
# A full-line SHA binds the exception to the exact original content without
# embedding or reprinting the password. New commits and current-tree scans
# remain subject to every existing pattern.
HISTORICAL_FIXTURE_SHA256 = "fb985f9f3609d2fd7162fa8a8493337cc9d46ff247d67d2156a1bbddd1028a33"
HISTORICAL_FIXTURE_PATH = "mobile/specwatt-app/tests/zcode-server-e2e.test.mjs"
HISTORICAL_FIXTURE_COMMITS = frozenset({
    "77985ef729f7fc96ef675e563c56c0f5e011f7d2",
    "72b953b9eccad4a3009842c948f24ab792a24138" ,
})


def audited_historical_fixture(pattern_id, commit, path, lineno, line):
    return (
        pattern_id == "generic-assignment"
        and commit in HISTORICAL_FIXTURE_COMMITS
        and path == HISTORICAL_FIXTURE_PATH
        and lineno == "19"
        and line.lstrip().startswith("const " + "PASSWORD" + " = ")
        and hashlib.sha256(line.encode("utf-8")).hexdigest() == HISTORICAL_FIXTURE_SHA256
    )

GENERIC_SKIP_GLOBS = ["*package-lock.json"]

MAX_FILE_BYTES = 2_000_000


def mask(match_text):
    return "[REDACTED]"


def allowlisted(pattern_id, match_text):
    for list_id, snippet, _reason in ALLOWLIST:
        value = re.search(r"[\"']([^\"']*)[\"']$", match_text)
        if list_id == pattern_id and value and value.group(1) == snippet:
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
            start = text.rfind("\n", 0, match.start()) + 1
            end = text.find("\n", match.end())
            line = text[start:end if end != -1 else len(text)].removesuffix("\r")
            if audited_source_literal(pattern_id, source, line):
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
                ["git", "grep", "-I", "-n", "-E", "-i", "-e", to_posix(pattern.pattern),
                 commit, "--"],
                cwd=REPO, capture_output=True,
            )
            if result.returncode == 1:
                continue
            if result.returncode != 0:
                raise RuntimeError('git history scan failed; results are incomplete')
            for line in result.stdout.decode("utf-8", "replace").splitlines():
                # Format: <commit>:<path>:<lineno>:<content>
                parts = line.split(":", 3)
                if len(parts) != 4:
                    continue
                content = parts[3]
                generic_skip = any(fnmatch.fnmatch(parts[1], glob) for glob in GENERIC_SKIP_GLOBS)
                if pattern_id == 'generic-assignment' and generic_skip:
                    continue
                for match in pattern.finditer(content):
                    if not allowlisted(pattern_id, match.group(0)) and not audited_source_literal(
                        pattern_id, parts[1], content
                    ) and not audited_historical_fixture(
                        pattern_id, commit, parts[1], parts[2], content
                    ):
                        findings.append((pattern_id, f"{commit[:12]}:{parts[1]}:{parts[2]}", mask(match.group(0))))
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", action="store_true",
                        help="scan every commit instead of the worktree")
    args = parser.parse_args()

    try:
        findings = scan_history() if args.history else scan_worktree()
    except (OSError, RuntimeError, subprocess.SubprocessError):
        print('SECRET SCAN: failed; results are incomplete')
        return 2
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
