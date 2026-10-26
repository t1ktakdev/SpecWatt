# Re-test checklist when v7 lands

Status at writing: v7 is **not published** — GitHub shows `main` @ `8a123c8`
(v6) only. When v7 (or any new revision) is pushed, re-run this list before
trusting any statement in threat-model.md or findings.md. Nothing here
requires real accounts or real hardware.

## 0. Baseline refresh

- [ ] `git fetch && git log --oneline` — diff the v6..v7 changed file list;
      map every changed backend/mobile file to the affected checks below.
- [ ] `python -m unittest discover -s security` — full suite must pass
      unchanged; every failure is either a real regression or a deliberate
      contract change that needs a findings.md update.
- [ ] `cd backend && python -m unittest discover -s tests` — upstream suite.

## 1. Dependency and secret re-audit

- [ ] `cd mobile/specwatt-app && npm audit --json > audit.json && python
      ../../security/check_npm_audit.py audit.json` — any new advisory needs
      triage; regenerate the baseline only with documented reasons.
- [ ] `pip-audit -r backend/requirements.txt` — still clean?
- [ ] `python security/scan_secrets.py --history` — covers new commits.
- [ ] Re-check the 5 baselined Expo toolchain advisories: is `@expo/cli`
      updated? If yes, regenerate the baseline and record it in findings.md.

## 2. API surface diff

- [ ] Enumerate changed/new routes. For every new controller-scoped route:
      add it to the BOLA matrix in `security/test_auth_bola.py::foreign_requests`.
- [ ] Re-verify: `owned()` on all controller routes; uniform 404; 401 with
      `WWW-Authenticate` for unauthenticated; pagination bounds; body cap.
- [ ] If auth internals changed (hash, token, expiry): re-run the whole
      `AuthSessionTests` class and re-check the SEC-001 regression test still
      covers the actual verifier format.

## 3. Command-safety re-verification

- [ ] CH3: all origins × both directions, assignment bypass, DB constraint,
      dispatch-time re-check (`Ch3ProtectionTests`, upstream protection test).
- [ ] Peak: boundaries 6.6/8.4, off-commands, settings race, 6-way
      concurrency (`PeakLimitTests`, `ConcurrencyTests`).
- [ ] Idempotency: replay, conflict, key scope, restart persistence.
- [ ] If a scheduling engine landed: run `test_invariants.py` with longer
      sequences (raise `max_examples` locally) and confirm I2/I7 hold for
      scheduler-originated commands; hand scheduler-specific defects to the
      Smart Scheduling workstream instead of patching it here.

## 4. Reliability re-verification

- [ ] Scenarios A–E in `test_reliability_faults.py`.
- [ ] Restart cases (`ScenarioCTests`) — especially if startup behaviour
      changed (auto-dispatch would be a Critical regression against I8).
- [ ] Crash atomicity (`CrashAtomicityTests`) — still single-transaction
      dispatch?

## 5. Mobile re-verification

- [ ] `security/test_repo_hygiene.py::MobileStaticSecurityTests` — token
      storage, 401-clear, demo/server separation, no console sinks.
- [ ] `cd mobile/specwatt-app && npm test && npm run typecheck && npm run lint`.
- [ ] If v7 produces a buildable APK: extend checks with manifest analysis
      (debuggable, backup rules, exported components, permissions) — see
      SEC-007; MASVS-RESILIENCE items still out of scope until then.
- [ ] If v7 introduces the help/room modules from other agents: check new
      inputs for the same strict-validation pattern and add them to the fuzz
      endpoint list.

## 6. Documentation

- [ ] Update threat-model.md §4 risk register with any changed mitigations.
- [ ] Update findings.md (add dated "v7 re-check" section; retire fixed
      findings).
- [ ] Update invariants.md if any contract changed deliberately.
