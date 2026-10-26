# Dependency review — 2026-10-26

`npm audit` reports 5 high entries: `expo`, `@expo/cli`, `@expo/code-signing-certificates`, `node-forge`, `zod`. These represent transitive chains rather than five independent application-code defects. TLS initially failed because Node did not use the system CA; rerunning with `NODE_OPTIONS=--use-system-ca` succeeded. Certificate validation was not disabled.

Installed `node-forge@1.4.0` has [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), RSA signature verification. The advisory lists no patched version as of this review; npm latest was1.4.0. It is used by Expo CLI/code-signing tooling. No direct application import exists, but this does not establish absence of every build/update attack path. Treat trusted build inputs and signing workflows carefully; do not claim a vulnerability-free release.

Installed `zod@3.25.76` has [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), collection validation resource exhaustion. The advisory names4.6.6 as fixed; npm latest was4.6.7. Expo CLI explicitly depends on^3.25.76 and React Hooks ESLint tooling also uses3.x. Forcing4.x is a major-version override with compatibility risk and was not applied. Application domain/API parsing does not import Zod, but CLI surfaces still need upstream-compatible fixes and review.

`npm audit fix --force` suggested Expo44.0.6, which would be a destructive SDK downgrade from58 and was not run. Expo install--check and Expo Doctor verify compatibility, not security remediation. All5 entries remain open; track upstream releases and re-audit before release. Backend dependency vulnerability audit is not yet a completed gate; pinned versions and functional tests are not a security advisory audit.
