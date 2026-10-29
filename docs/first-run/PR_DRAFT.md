# Draft PR description (local only; not submitted)

Title: Complete SpecWATT first-run journey and route authentication to FastAPI

First launch previously contained credential forms that always returned offline and a controller choice that completed onboarding before any real connection. This change adds a persistent RU/KY introduction with three cards, progress, Back/Skip and explicit DEMO/controller/server choices. Controller discovery is accurately unavailable; login and registration use the existing server workspace, with password visibility/autofill and cancellation protection. Native splash startup has a four-second fallback.

Backend, firmware, the six main screens and CH3 behavior are unchanged. No second token store or session was introduced.

Validation: 226 mobile tests, typecheck/lint, WEB/Android exports, 90 backend tests, 102 security tests, HTTP smoke, Bandit, secret scan and actual browser parcours. See REPORT.md for exit codes and WEB evidence. Expo Doctor fails its patch-version alignment check (19/20); npm audit still lists nine known advisories, including four high. Android native acceptance is blocked by unavailable emulator/device.

Reviewer focus: optional firstRunStep migration and serialized writes; abort during authentication/vault write; controller information must not complete onboarding; no consent/CH3 changes. Auth handoff is intentionally /server rather than duplicated credential logic.

Do not push, merge, publish or change main/PR #3 without the owner's permission.
