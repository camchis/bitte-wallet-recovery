# Bitte/Mintbase Wallet Recovery

Recover the private key for a historical **Bitte** or **Mintbase** NEAR passkey wallet using the passkey you already have. You do not need the old wallet website or its former backend which have both been shutdown suddenly, without any migration process.

**Use at your own risk.** This app is not affiliated with Bitte, Mintbase, NEAR, or any password manager. Password-based wallets and Windows/Safari launchers are not supported. There is no independent security audit. See [security and privacy](SECURITY.md) and [historical implementation evidence](docs/IMPLEMENTATION.md).

The app runs on your Mac. It never uploads the recovered NEAR private key and does not move funds, add keys, or modify your passkey.

## What you need

- A Mac running macOS 13 or newer. Apple Silicon and Intel builds are included; Intel execution still needs validation.
- [Google Chrome](https://www.google.com/chrome/) installed in Applications.
- Your NEAR account name, such as `example.near`.
- The **original passkey** created for `wallet.bitte.ai` or `wallet.mintbase.xyz`.

A newly created passkey or an ordinary password cannot replace the original wallet passkey.

## Download the app

Download the app from [Releases](https://github.com/Near-Wallet-Recovery/bitte-wallet-recovery/releases) or build from source.

### Build from source on macOS

Install **Node.js 22 or newer** (which includes npm). Chrome must also be installed as described above.

```sh
npm install
npm run build
```

You can now run recovery directly from Terminal.

```sh
npm start
```

This opens Chrome using Apple Passwords mode. For another provider, specify it when starting; for example, Google Password Manager:

```sh
npm start -- --provider=google
```

Provider IDs are `apple`, `google`, `1password`, `bitwarden`, `proton`, `dashlane`, `other`, `security-key`, and `phone`. Keep Terminal open during recovery. When finished, press **Control+C** in Terminal to stop the servers and close the dedicated Chrome process. Follow the recovery steps below; the **Quit Recovery** step is replaced by Control+C when running from Terminal.

## Recovering via the MacOS app

1. **Choose your passkey provider.** Select where the original passkey is stored and click **Open Recovery**. The app opens a separate Chrome profile for this provider.
2. **Set up the provider if needed.** Google Password Manager users sign in to the correct Google account in that Chrome profile. Extension-manager users install their provider's official Chrome extension and unlock it. The page shows instructions. Enter passwords and PINs only in your provider's own interface; this app never asks for them.
3. **Choose your wallet.** Enter the NEAR account name and choose the website shown on the passkey. Find the public access keys, select a FullAccess key, and click **Prepare recovery**. If there are several keys, you can try another in a new session.
4. **Use the existing passkey.** Confirm the page says **Local origin ready**. Apple Passwords and hardware-key modes ask you to disconnect internet. Other modes can stay online for provider authentication. Confirm the readiness checkbox and click **Use existing passkey**.
5. **Save only a matching key.** If the page reports a match, click **Save recovered key**. Choose a local folder outside iCloud Drive, Dropbox, Google Drive, or other synced storage. The file is unencrypted and gives control of your wallet. Keep it private.
6. **Quit Recovery.** The app stops its servers and closes the Chrome process it opened. Verify all recovery windows have closed. For offline modes, do this before reconnecting internet.

The app preserves your passkeys and browser profiles. It only offers a download after the reconstructed key matches the selected existing public key.

## Passkey providers

Setup options include **Apple Passwords, Google Password Manager, 1Password, Bitwarden, Proton Pass, Dashlane, other compatible managers, hardware security keys, and a passkey on your phone**.

These are integration options, not a promise that every provider/version works. See the [compatibility table](docs/PROVIDERS.md) for what has been tested. Internet access for a provider does not cause this app to upload your recovered key.

## If recovery does not work

**No passkey appears:** check the selected website and provider. A separate Chrome profile does not automatically have your Google or extension-manager session. Unlock the correct provider, and keep the original passkey intact. Do not reset, delete, or recreate it.

**No key matches:** check the chosen FullAccess key and account. A different credential, unsupported signature type, or historical wallet version can also cause a mismatch. The app does not save any candidate key on failure.

**The app will not open or Chrome shows a certificate warning:** stop. Obtain a verified release; do not bypass certificate warnings or install a certificate into Apple Keychain.

**A recovery port is busy:** close the other recovery session, then retry as instructed. After a crash, check that all dedicated recovery windows have closed before starting again.

When reporting a problem, share only the app version, macOS/Chrome version, selected provider and the plain error message. Never attach a private-key file, passkey data, provider password/PIN, browser profile, or screenshot showing secrets.

## Privacy and limits

The setup step sends your public account name to a public NEAR RPC (https://rpc.mainnet.near.org) to find existing access keys. Your chosen passkey provider may contact its own services. Key reconstruction and saving happen on your device, and the recovery page has no upload route or analytics.

The old wallet design derives the NEAR key from the passkey's public point. A provider or historical service knowing that point could independently derive the same wallet key. This app cannot change that design or promise secrecy from the original provider, a malicious extension, or a compromised device.
