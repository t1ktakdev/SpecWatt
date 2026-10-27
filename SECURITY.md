# Security policy

SpecWATT is an educational load-management project. The server component is a
**local simulator**; it is not deployed as a public service, and no physical
hardware transport exists in the published code.

## Supported state

Security review artifacts live in [`security/`](security/README.md): threat
model, prioritised findings, executable invariants, and an automated test
suite. The backend-specific boundary statement is
[`backend/SECURITY.md`](backend/SECURITY.md).

## Reporting a vulnerability

Please do **not** open a public issue for anything that looks like an
exploitable defect. Use GitHub's private vulnerability reporting
("Report a vulnerability" on the Security tab), or contact the repository
owner directly. Include reproduction steps against the local simulator.

Reporters should not test against instances or equipment they do not own.

## Handling rules for maintainers

- Never publish secret values, tokens or exploit payloads in issues, PRs or
  CI logs. The repository secret scanner (`security/scan_secrets.py`) prints
  only masked values for this reason.
- If a real secret ever lands in the history, rotate it immediately —
  removing the file from a new commit does not unpublish it.
- Dependency advisories are triaged via `security/check_npm_audit.py` against
  a reviewed baseline; see `security/docs/findings.md` for the current list.
