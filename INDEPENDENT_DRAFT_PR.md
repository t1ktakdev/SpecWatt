# Prepare reviewed SpecWATT UI for integration

Target: `integration/unified-v7-20261027` at `e27fe00b5ece3115650c962f5b038a2b49404bb5`.
Source: local `codex/specwatt-independent-review-20261028`, code tip `cb9e5060b8d6bdbdb4ae7778d7429905bfe291fc` plus review documentation.

The nine original UI commits improve SVG-first device appearances, responsive cards/charts, RU/KY onboarding, motion/focus and browser fetch binding. Independent review corrects a fixed demo history labelled as today's measurements, broken enlarged words on 320px, and QA tools that fail from a clean checkout or collide with an occupied port. Existing authorship is preserved.

Validation: 208 mobile + 6 core + 90 backend + 101 security tests pass; types/lint, Expo Doctor 20/20, WEB/Android bundle exports, secret scans, Medium+ Bandit and npm baseline gates pass. Real browser tests cover demo persistence, CH3, requested vs simulator ACK, accepted POST with lost response (no retry), offline GET and expired session. 84 fresh WEB captures and focused before/after regressions are linked in INDEPENDENT_REVIEW.md.

Known limits: native Android/TalkBack/photo picker and hardware are unverified; main screens remain DEMO and server workspace separate. Existing npm baseline contains 9 advisories (4 high); unchanged by this PR. No release/live-measurement claim. Full details, exact source commits, failures and file inventory are in INDEPENDENT_REVIEW.md.

This is a local draft description only. Remote push, PR creation and merge require separate user authorization.
