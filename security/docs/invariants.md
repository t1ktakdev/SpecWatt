# Security invariants of SpecWATT

Each invariant is a property that must hold in **every** code path, in any
state, under any valid input sequence. The right-hand column names the
executable check that fails if the invariant is violated. When v7 lands, the
same table must be re-verified (see v7-retest-checklist.md).

| # | Invariant | Verified by |
|---|---|---|
| I1 | The protected channel (CH3) cannot be switched by any path: no origin, no assignment change, no direct DB write, no client shortcut. | `test_command_safety.py::Ch3ProtectionTests`, P1/P6 in `test_invariants.py`, mobile `CH3 is rejected locally` test |
| I2 | Without explicit per-channel user consent (`allow_auto`), no automatic or scheduled command is admitted — and consent is re-checked at dispatch time, not only at request time. | `ConsentAndPriorityTests`, `test_automation_permission_rechecked_at_dispatch` (upstream) |
| I3 | "No measurement" is never presented as "0 W". Stale or uncertain state returns `null` watts/total and retains `last_known_watts`. | `ScenarioDTests`, P3 in `test_invariants.py`, mobile stale-snapshot tests |
| I4 | A successful HTTP response is not a physical confirmation. Only an explicit acknowledgement transitions a command to `acknowledged`; `timeout`/`transport-error`/`reconciled` are distinct states that never imply delivery. | `ScenarioATests`, `test_reliability_faults.py::ScenarioDTests`, client-side `unresolved()` status handling |
| I5 | The offline demo mode never sends real commands and shares no state with the server client. | `test_repo_hygiene.py::MobileStaticSecurityTests` (no cross-imports), mobile `api.ts` contract |
| I6 | Data of one user is invisible to another: every controller-scoped endpoint answers a uniform 404 for foreign users, and 401 for unauthenticated callers. | `test_auth_bola.py::BolaTests` |
| I7 | A plan or schedule that cannot be safely executed is never represented as safely executable: automation is gated by consent, manual hold and fresh telemetry at dispatch time. | `ConsentAndPriorityTests`, `PeakLimitTests::test_peak_rechecked_at_dispatch_after_settings_change` |
| I8 | In an uncertain or failed state the system never fabricates confirmed success: no auto-retry, no auto-dispatch on restart, reconciliation only reports. | `ScenarioATests`, `ScenarioCTests`, `CrashAtomicityTests`, P4 in `test_invariants.py` |
| I9 | Commanded total power never exceeds the configured peak; every channel sits at 0 W or its nominal value. (`peak_watts` bounds *commands*; authoritative telemetry may honestly report more.) | `PeakLimitTests`, `ConcurrencyTests`, P2 in `test_invariants.py` |
| I10 | A command executes at most once for a given idempotency key; a key never executes a different intent; keys are scoped per controller. | `IdempotencyTests`, `ScenarioCTests::test_idempotency_bookkeeping_survives_restart` |
| I11 | A crash or restart never leaves a half-applied actuation: dispatch is atomic (rollback to `requested`), no command lingers in `sent`. | `CrashAtomicityTests` |
| I12 | Sessions are revocable and expire: a logged-out or expired token is unusable on every endpoint; tokens are stored only as digests server-side and in SecureStore client-side. | `test_auth_bola.py`, `ScenarioETests`, mobile static checks |
| I13 | The service never turns hostile or damaged input into a 5xx: strict schemas, body cap, bounded pagination, redacted validation errors. | `test_fuzz_input.py`, `test_auth_bola.py` |
| I14 | The public repository contains no secrets, credential files or runtime databases; dependencies are pinned; known dependency risk is reviewed and baselined. | `test_repo_hygiene.py::RepoHygieneTests`, `scan_secrets.py`, `check_npm_audit.py` |

Two documented, deliberate exceptions to "power limit" readings:

- Turning a channel **off** is never peak-blocked (reducing power must always
  be possible) — asserted in `PeakLimitTests::test_turning_off_is_never_blocked_by_peak`.
- Telemetry above peak is allowed to be *displayed* (it is a measurement, not
  a command) — noted in `threat-model.md` R4 and excluded from P2.
