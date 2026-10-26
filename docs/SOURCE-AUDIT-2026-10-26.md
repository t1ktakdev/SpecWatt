# Source and design access audit — 26 October 2026

This records the starting state before the current continuation work. Later implementation changes can make archive comparisons differ.

## Working sources and archive

The live app is `mobile/specwatt-app`, with an installed Expo `58.0.19` package, React Native sources, bundled images and Manrope font, an onboarding route, channel assignment flow, and a simplified home route. The user supplied six Warm Graphite screen images as visual references.

Archive inspected without extraction or replacement:

`outputs/SpecWATT-WarmGraphite-v5-Controller-Expo-2026-10-26.zip`

| Property | Result |
| --- | --- |
| Archive file size | 32,266,013 bytes |
| ZIP entries | 176 |
| Sum of compressed entry sizes | 32,236,103 bytes |
| Sum of uncompressed entry sizes | 40,260,184 bytes |
| Top-level entry roots | `mobile`, `outputs`, `work` |
| Archived files under `mobile/specwatt-app/` | 55 |
| Byte-identical to corresponding working files at audit | 55 |
| Different / missing working files in that comparison | 0 / 0 |

Comparison used SHA-256 digests of ZIP entry bytes and existing working-file bytes. It checked archived app files, not whether the archive contains every file in the working directory. The live project was not replaced by the archive. A filename-only scan of ZIP entries for `.env`, `adbkey`, `.jks`, and `.keystore` returned no matches; this is not a complete secret scan.

## Git / GitHub baseline

- Workspace root had no `.git` directory.
- `mobile/specwatt-app/.git` exists and `git rev-parse --show-toplevel` resolves there.
- `git log -1 --oneline` reported that branch `master` has no commits.
- `git remote -v` returned no configured remote.
- The index and working tree contain staged scaffold files and subsequent modifications, deletions, and untracked SpecWATT files. This pre-existing state was not reset.
- Both `git ls-remote https://github.com/t1ktakdev/SpecWatt.git` and `git ls-remote --symref https://github.com/t1ktakdev/SpecWatt.git HEAD` exited successfully with no returned refs. This is consistent with an accessible empty repository; no remote source history was available to compare.
- No commit, push, or remote configuration was performed by this audit.

## Figma access

Source URL: <https://www.figma.com/design/ge735l7Qim9ySVcG3BoeCx>

The parent attempted the Figma connector's `get_metadata` and received `MCP tool codex_apps/figma.get_metadata is not available to the model`.

As a read-only fallback, the installed Figma desktop application was launched through the Computer Use skill. It exposed one window titled `Untitled - Figma`. Its accessibility tree showed a login page at `https://www.figma.com/login?locale=en&is_not_gen_0=true`, with `Sign in to Figma` and `Log in with browser`; it did not expose a design canvas. Authentication was not automated.

Consequently, no live Figma node IDs, token values, frame dimensions, or design-context assets were retrieved or verified. The supplied PNG references and existing local resources remain usable for implementation, but correspondence to the live Figma file must be checked when authenticated design access becomes available. Do not describe the implementation as verified against the live Figma source based on this audit.
