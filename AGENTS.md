# Contributor instructions

This tool reconstructs historical Bitte/Mintbase NEAR wallet keys on the user's device using standard WebAuthn. Keep credential preservation and privacy ahead of convenience.

- Never register, delete, replace or extract a passkey, clear browser storage, directly edit Apple Keychain, or import TLS certificates into Keychain.
- Never transmit or log WebAuthn assertions, credential public points, candidate seeds, recovered NEAR keys, cookies or vault credentials. Standard authentication through the user's chosen passkey provider may use its normal services.
- Never commit profiles, certificates, account snapshots, recovered files or credentials.
- Do not add on-chain transactions without explicit user authorization.
- Retain origin/RP/challenge validation, existing-key matching, explicit local export, static-only recovery routes and restrictive CSP.
- A provider knowing the historical passkey public point may independently derive the NEAR key. Never claim provider isolation or universal compatibility.
- Preserve existing browser state. Tests use synthetic credentials, temporary profiles and mock processes only.
- Keep source provenance in RECOVERY_NOTES.md and docs/IMPLEMENTATION.md. Keep personal research outside this repository.
- Use `npm ci --ignore-scripts --no-audit --no-fund`, `npm run build`, `npm run setup`, `npm test` and `npm run check-public` for validation. Build the macOS app on macOS using `npm run build:macos`.
- Public app releases require Developer ID signing/notarization and recorded device/provider validation. Do not label unsigned or unvalidated builds as production releases.
