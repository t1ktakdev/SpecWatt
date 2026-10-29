# SpecWATT: Warm Graphite product UI and vector-first device rendering

Base: integration/unified-v7-20261027. Draft description only; no remote PR published.

Legacy device assignments silently selected bundled photos, cards used overlapping fixed geometry, and chart/navigation labels were too small. This change makes original SVG artwork the default, preserves explicit owned photo choices, separates device navigation from channel toggles, and provides consistent responsive Warm Graphite components across the primary flows. Missing/stale telemetry stays unknown; CH3 stays read-only. Autopilot proposals, W/Wh and simulator command acknowledgements retain their existing meaning.

Charts now use adaptive scales and fontScale-aware geometry. Onboarding/journal empty states, catalog controls, navigation widths, keyboard focus and reduced motion were refined. A browser-only baseline transport bug is fixed by binding default fetch to globalThis; no endpoint or backend semantics changed.

Validation: mobile 206/206; typecheck/lint; web and Android exports; security 101/101; backend 90/90 + loopback HTTP smoke; secret scans and diff check. Real RU/KY browser flows cover one-action switches, catalog/save/reload, none mode and server requested→explicit simulator ACK. Raw before/after images have SHA-256 manifests.

Native emulator/device QA and native performance profiling remain unverified. See UI_IMPLEMENTATION_PLAN.md and UI_VERIFICATION_REPORT.md for evidence and limits.
