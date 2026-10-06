# Historical implementation evidence

This file contains public implementation evidence for historical Bitte/Mintbase passkey wallets. It contains no personal account identifiers, browser state, assertions or recovered material. The original private research archive is kept outside the repository.

## Captured versions

- Bitte HTML: [1 November 2024 capture](https://web.archive.org/web/20241101071258id_/https://wallet.bitte.ai/). The referenced content-hashed production bundles establish the captured frontend version; they do not prove every October 2024 deployment used it.
- Mintbase HTML: [1 June 2024 capture](https://web.archive.org/web/20240601003724id_/https://wallet.mintbase.xyz/).
- Mintbase cryptographic bundle: [23 May 2024 capture](https://web.archive.org/web/20240523155657id_/https://wallet.mintbase.xyz/_next/static/chunks/6470-99d933d10f97f06e.js), SHA-256 `58c627b45e6b950e09cf958497423ede605aaa10e8eb6213cb252b4399d5ff63`. Modules 55793 and 12326 contain the equivalent derivation.

## Authentication and signing-key derivation

Bitte modules 30541 (`getKeys`, `createKey`) and 32222 (`recoverPublicKey`) use browser WebAuthn, P-256 public-key recovery from ECDSA assertions, SHA-256 of the uncompressed 64-byte X || Y public point, and a separate ed25519 NEAR key. Mintbase modules 55793 and 12326 implement the same captured derivation.

The Apple/WebAuthn private key is not the NEAR private key. The captured passkey path reconstructs the separate NEAR key rather than retrieving a password-encrypted local seed. Passkey registration was discoverable, with RP ID `location.hostname`, platform authenticator preference, preferred user verification and a 90-second timeout. The local tool only authenticates: a fresh 128-byte challenge, selected original RP, discoverable selection and preferred user verification.

The recovery implementation in `src/recover.js::recoverMatchingKey` checks client-data type, exact origin, challenge, RP hash and user presence; tries the two historical P-256 recovery candidates; hashes X || Y into an ed25519 seed; and only returns an existing key matching the selected public FullAccess key. `src/app.js` offers explicit local export of that match. Unsupported assertions or mismatches never enable export.

## Storage, backend and export

The captured passkey path uses local account metadata but does not require a persisted NEAR private key for this derivation. The distinct historical password path stored encrypted key material under localStorage `key:<accountId>`, using PBKDF2/SHA-256 (10,000 iterations) and AES-GCM. Password-mode recovery is not implemented here.

The historical Export Account hook generates a new mnemonic/key and sends AddKey through the wallet's relay/on-chain flow. It is not needed to reconstruct the existing signing key and is not executed by this tool. The tool performs no transaction or migration.

The old full frontend depended on Bitte services, but the captured cryptographic helper does not require that former backend. This tool only needs a public read-only NEAR access-key lookup before freezing the target: `https://rpc.mainnet.near.org`, JSON-RPC `query`, `view_access_key_list`, finality `final`. No assertion or NEAR secret is sent to the RPC. Original browser metadata may help identify accounts or non-discoverable credential IDs, but the implemented discoverable-passkey path does not read or copy an original profile.

## Original RP origin

Passkeys remain scoped to their original RP. `wallet.bitte.ai` and `wallet.mintbase.xyz` are unrelated RPs; branding, redirects and the NEAR account suffix do not transfer credentials. The launcher maps only these hostnames to loopback within Chrome and serves HTTPS on port 8443. No system hosts edit or Keychain certificate installation is performed. GitHub Pages cannot replace the original RP origin for authentication.

## Provider networking and trust

The NEAR derivation/export runs on the user's device. Standard provider authentication may use provider services. Chrome's Google Password Manager enclave path performs a network transaction for the assertion itself: [`EnclaveAuthenticator::DispatchGetAssertion`](https://chromium.googlesource.com/chromium/src/+/main/device/fido/enclave/enclave_authenticator.cc) calls [`Transact`](https://chromium.googlesource.com/chromium/src/+/main/device/fido/enclave/transact.cc), which creates an enclave WebSocket client. Initial synchronization alone does not establish offline GPM authentication.

Extension-based managers use their standard WebAuthn integration. The recovery page retains `connect-src 'none'`, self-only scripts, no upload endpoint and explicit local download in all modes. This does not isolate it from a trusted extension or the original provider. A service knowing the historical credential public point can derive the same NEAR key. See README.md for provider options and validation limitations.

## Validation and limitations

Synthetic tests independently verify the historical derivation, both RP domains, public account lookup, strict request/origin handling, matching-only export, provider configuration, profile preservation, browser supervision and native status handling. These do not establish genuine provider/device compatibility. macOS release signing/notarization, Intel execution and controlled real-provider validation must be completed before advertising a stable app release.

```text
Original passkey in the user's chosen provider
    |
    v
Standard WebAuthn authentication at the original RP
    |
    v
P-256 public-point recovery from the ECDSA assertion
    |
    v
SHA-256(uncompressed X || Y) -> ed25519 seed
    |
    v
Match derived NEAR public key to an existing FullAccess key
    |
    v
Explicit local NEAR private-key export
```

More source/function references are in docs/IMPLEMENTATION.md. Numeric module identifiers refer to minified production bundles; original source maps were not recovered. Do not describe inferred backend internals or uncaptured versions as proven.

## Publication preparation (0.5.0)

The application source now lives at the repository root. Personal account references, private research, original notes, historical downloaded projects/bundles, old builds and local browser state were preserved outside the public repository. No browser storage or passkey was cleared. This public document replaces the personal research log with source evidence relevant to contributors.

Publication checks validate the complete Git candidate set against explicit package inputs, reject unapproved/private files and common secret formats, and check documentation links. Preview artifacts are named separately from signed/notarized releases. The release command requires existing Developer ID/notarytool credentials and successful verification; it does not import certificates or publish automatically. Real-provider validation and actual signing/notarization remain release prerequisites.

The vulnerable development-only elliptic test oracle was removed. Synthetic P-256 points/signatures and ed25519 public keys now come from Node/OpenSSL, independently of the browser's Noble derivation. Both ECDSA recovery candidates and high/low-S assertions remain covered. Runtime cryptographic behavior was unchanged.

Validation of the publication layout: the 58-file source archive was extracted into a clean temporary directory, installed offline with npm lifecycle scripts disabled, rebuilt and given fresh test-only TLS files. All 70 tests passed, including the publication scanner's negative tests and release-without-credentials refusal. Public-file and packaged-document checks passed in both the workspace and clean extraction; the dependency audit reported zero vulnerabilities. The universal preview app compiled and passed deep strict ad-hoc signature verification. No Developer ID Application identity is configured on the development Mac, so signing/notarization has not been attempted. Real provider/device validation is still required before a stable app release. No repository commit, GitHub publication, genuine credential operation or on-chain transaction was performed.
