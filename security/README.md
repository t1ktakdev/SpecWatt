# SpecWATT security & reliability suite

Independent security-QA layer for the SpecWATT backend (FastAPI simulator) and
mobile client (Expo/RN). It runs entirely in-process against throwaway SQLite
databases: **no real accounts, no hardware, no network targets.**

## Run (Windows, from the repository root)

```powershell
# Server + mobile runtime deps
python -m venv backend/.venv            # once
backend\.venv\Scripts\python -m pip install -r security/requirements-tools.txt

# The full security suite (83 checks)
backend\.venv\Scripts\python -m unittest discover -s security -v

# Secret scan (worktree + full history; masked output, CI-safe)
backend\.venv\Scripts\python security/scan_secrets.py --history

# Dependency audits
pip-audit -r backend/requirements.txt
python -m bandit -r backend/specwatt_api -ll -q
cd mobile/specwatt-app && npm audit --json > audit.json && cd ../..
python security/check_npm_audit.py mobile/specwatt-app/audit.json
```

pytest works too (`pytest security/ -q`) — the suite is plain `unittest`.

## What lives here

| Path | Purpose |
| --- | --- |
| `support.py` | `Lab` — isolated app+SQLite instance per test (fresh rate-limit budget) |
| `test_auth_bola.py` | Registration/login/session lifecycle, BOLA matrix (API1/API2), rate limits, body cap |
| `test_command_safety.py` | CH3 protection (4 layers), peak boundaries, consent/manual-priority, idempotency, concurrency races |
| `test_reliability_faults.py` | Scenarios A–E (lost ack, restart, crash atomicity, bad telemetry, session end), corrupted state |
| `test_invariants.py` | Property-based invariants (hypothesis) + seeded random walk fallback |
| `test_fuzz_input.py` | ≈220 malformed/hostile requests across 8 endpoints — never 5xx |
| `test_repo_hygiene.py` | Repo hygiene + mobile static security checks as regression tests |
| `scan_secrets.py` | Standalone secret scanner (worktree/history, values masked) |
| `check_npm_audit.py` | npm audit baseline gate — fails only on NEW/escalated advisories |
| `baselines/npm-audit-baseline.json` | The five reviewed Expo-toolchain advisories |
| `docs/threat-model.md` | Trust boundaries, adversaries, risk register with verification mapping |
| `docs/findings.md` | Prioritised findings (SEC-001…SEC-007) with evidence and status |
| `docs/invariants.md` | The 14 security invariants and the test that guards each |
| `docs/v7-retest-checklist.md` | What to re-run when v7 (or any new revision) is published |

## Design rules

- **Isolation.** Each test builds its own `Lab` (temp DB + fresh app). The
  in-memory rate limiter resets with the app; tests keep request counts below
  the documented budgets or reopen the app deliberately.
- **No shared surface edits.** The suite treats server routes as a contract.
  The only production change in this branch is the SEC-001 login fix (a
  6-line robustness correction) with its regression test.
- **Standards as requirements, not claims.** MASVS/MASTG, API Security Top 10
  and ASVS shaped the checklist; passing these tests does not assert
  compliance with any standard.
- **CI-safe.** The secret scanner masks matched values; the npm gate is
  baseline-based so known toolchain debt does not block PRs while new
  advisories do.

See `.github/workflows/security.yml` for the automated PR gate.
