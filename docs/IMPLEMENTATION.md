# Historical mechanism and local reconstruction

The primary evidence is the wallet's [1 November 2024 HTML capture](https://web.archive.org/web/20241101071258id_/https://wallet.bitte.ai/), which references content-hashed production assets. The cryptographic asset was captured on 6 November with the same filename:

- [9971-46e7c784c03a97a2.js](https://web.archive.org/web/20241106140556id_/https://wallet.bitte.ai/_next/static/chunks/9971-46e7c784c03a97a2.js): module **30541**, exported `getKeys`; module **32222**, exported `recoverPublicKey` and `get64BytePublicKeyFromPEM`; module **59763**, local Fido2 setup.
- [7971-cbff7791dd6a7af3.js](https://web.archive.org/web/20241101073159id_/https://wallet.bitte.ai/_next/static/chunks/7971-cbff7791dd6a7af3.js): module **44625**, wallet account unlock and `InMemoryKeyStore`; module **24114**, separate password-encrypted key branch; module **80859**, password PBKDF2/AES-GCM storage.
- [4637-20fc0a09350ea683.js](https://web.archive.org/web/20241031045515id_/https://wallet.bitte.ai/_next/static/chunks/4637-20fc0a09350ea683.js): module **88689**, historical export hook, creates a new mnemonic/key and requests an on-chain FullAccess `AddKey`. This tool does not implement it.

The historical Mintbase site has independent production evidence: [1 June 2024 HTML](https://web.archive.org/web/20240601003724id_/https://wallet.mintbase.xyz/) references [6470-99d933d10f97f06e.js, captured 23 May 2024](https://web.archive.org/web/20240523155657id_/https://wallet.mintbase.xyz/_next/static/chunks/6470-99d933d10f97f06e.js). Module **55793** exports `getKeys` and `createKey` and sets `rpId: location.hostname`; module **12326** exports `recoverPublicKey` and `get64BytePublicKeyFromPEM`. These reproduce the same P-256 recovery bits, SHA-256(X || Y), and ed25519 seed/key serialization as the Bitte modules. This establishes the captured version, not every historical Mintbase deployment.

Original frontend TypeScript paths are unavailable; the bundle module IDs are the exact references recovered. Similar public code exists in [@near-js/biometric-ed25519 1.0.1](https://unpkg.com/@near-js/biometric-ed25519@1.0.1/src/index.ts) and [utils.ts](https://unpkg.com/@near-js/biometric-ed25519@1.0.1/src/utils.ts). The deployed package version is not proven; the production bundles are authoritative.

## Derivation reproduced by `src/recover.js`

```text
Existing passkey at the selected original wallet domain
    |
    v
navigator.credentials.get
    |
    v
SHA256(authenticatorData || SHA256(clientDataJSON))
    |
    v
ECDSA public-key recovery on P-256, recovery bits 0 and 1
    |
    v
For each point: SHA256(64-byte X || Y)
    |
    v
32-byte ed25519 seed -> NEAR keypair
    |
    v
Match to a previously downloaded FullAccess NEAR public key
    |
    v
Explicit local save of ed25519:base58(seed || publicKey)
```

The WebAuthn passkey private key is not the NEAR ed25519 private key. No Apple private-key extraction, WebAuthn PRF, backend-held secret, or encrypted browser-key decryption is used in this captured passkey branch. The credential public point itself is sensitive here because its hash derives the wallet seed.

`recoverMatchingKey` preserves the two historical recovery bits and exact point/hash/ed25519 encoding. It additionally validates fresh challenge, assertion type, actual local origin, RP hash, and user presence. User verification remains `preferred`, matching the historical configuration. `src/domains.js` allowlists wallet.bitte.ai and wallet.mintbase.xyz; `src/app.js` uses the selected target RP and supplies a locally random 128-byte challenge and 90-second timeout with an empty allowCredentials list.

`account.mjs` performs only a public access-key-list query before authentication. `setup-server.mjs` forbids WebAuthn via Permissions Policy and accepts only public account/key JSON. It closes after selecting an immutable account/key/RP target. `server.mjs` then serves a static recovery page with `connect-src 'none'` and no request body parser. No derived candidates are sent to an account indexer.

## Platform references

- [WebAuthn RP-ID definition](https://www.w3.org/TR/webauthn-2/#rp-id): credential scope uses the domain without a port. The selected local RP is wallet.bitte.ai or wallet.mintbase.xyz; origin validation uses https://<selected-RP>:8443. The certificate covers both domains, but the recovery server permits only the selected Host.
- [Chromium scoped SPKI verifier](https://chromium.googlesource.com/chromium/src/+/24fe268fd13ed59f189c7cd688e472adb7489fe9/services/network/ignore_errors_cert_verifier.h): certificate exceptions require an explicit user-data directory and a matching SPKI digest.
- Installed/tested source version **154.0.8037.98**: [GetKeyTask in KeychainKeyProvider](https://github.com/chromium/chromium/blob/154.0.8037.98/components/os_crypt/async/browser/keychain_key_provider.mm) honors `kUseMockKeychain` with `FakeKeychainV2`; [switch declaration](https://github.com/chromium/chromium/blob/154.0.8037.98/components/os_crypt/common/os_crypt_switches.h). This concerns Chrome's OS-crypt storage, not the Apple WebAuthn API.
- [Noble curves 1.9.7](https://github.com/paulmillr/noble-curves/tree/1.9.7) supplies runtime P-256 and ed25519; Node/OpenSSL supplies the independent synthetic public-key/signature oracle.

No claim is made that all historical Bitte deployments or passkey algorithms are supported. An independent audit and broader real-device testing remain outstanding.


## Provider modes (0.4.0)

The derivation above is unchanged. `src/providers.js` defines provider capabilities and setup instructions. `browser-config.mjs::buildChromeArgs` permits networking for Google/extension/cross-device modes, enables extensions only for extension modes, and keeps the RP-to-loopback mapping and certificate-specific exception. `desktop-session.mjs::startDesktopSession` uses separate provider profiles, freezes the provider before startup, passes its ID to both setup and recovery servers, and never receives the assertion. `src/app.js` uses identical standard WebAuthn authentication and local matching/export for every provider. `server.mjs` retains its no-upload policy and `connect-src 'none'` in all modes.

Provider setup paths are implemented and synthetically tested; genuine provider authentications have not been verified. See [compatibility and trust boundaries](PROVIDERS.md). User requirements now permit normal provider networking while NEAR key derivation/export remain on the user's device. This does not establish secrecy from an original passkey provider that knows the public point hashed into the wallet seed.
