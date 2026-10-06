# Contributing

Use synthetic credentials and authorized test wallets. Never add real wallet material, browser profiles, provider sessions, TLS private keys or personal recovery notes to Git. Follow AGENTS.md and SECURITY.md.

## Develop from the repository root

Requirements: Node 22+, npm, OpenSSL, and macOS/Chrome for the actual launcher. The cryptographic and server tests also run on Linux. Xcode Command Line Tools are needed to build the native app.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run setup
npm test
npm run check-public
npm run check-package
npm start
```

For another provider:

```sh
npm start -- --provider=google
npm start -- --provider=bitwarden
```

Available provider IDs are in `src/providers.js`. Press Ctrl+C to close the owned browser and servers. The source launcher uses ignored `.local/`; the app uses `~/Library/Application Support/Bitte Local Recovery`. Existing state is preserved. Do not change browser storage or Keychain as test cleanup.

## Layout

- `src/` and `public/`: recovery/setup interface and historical derivation.
- Root `.mjs` modules: public account lookup, loopback servers, browser configuration and supervised lifecycle.
- `macos/`: native launcher, state handling and backend entry point.
- `test/`: synthetic crypto/UI/server/lifecycle tests.
- `scripts/`: builds, allowlisted packaging and publication checks.
- `docs/`: provider compatibility, historical evidence and release operations.

No downloaded historical wallet bundles are executed. Public evidence links are maintained in RECOVERY_NOTES.md and docs/IMPLEMENTATION.md; private research is kept outside the repository.

## Packaging and publishing

```sh
npm run build:macos
node scripts/check-package.mjs --archive
```

The macOS command creates a clearly named preview ZIP, checksum and manifest under ignored `.local/`. It is ad-hoc signed for local testing, not a public release. The source archive includes only allowlisted public files and can be extracted as a clean repository without local state.

Before pushing, run `npm run check-public`. It checks both tracked and untracked files that Git would include, rejects unknown/secret-bearing files, and checks documentation links. This is an additional safeguard, not a substitute for reviewing the file list. Do not force-add ignored files. No commit hook is installed automatically.

CI runs clean installation, builds, tests, a dependency audit, public-file checks, source packaging and a universal macOS preview build. See [release operations](docs/RELEASING.md) for signed public app requirements.

Keep PR descriptions focused on the user-visible behavior and relevant validation. Report vulnerabilities through a private channel described in SECURITY.md; do not put recovery material in issues or PRs.
