const provider = (id, label, mode, helpUrl, instructions) => Object.freeze({ id, label, mode, helpUrl, instructions, online: mode !== 'offline', extensions: mode === 'extension' });
export const PASSKEY_PROVIDERS = Object.freeze([
  provider('apple', 'Apple Passwords', 'offline', 'https://support.apple.com/guide/passwords/mchl4af65d1a/mac', 'Use the existing passkey in Apple Passwords. Disconnect internet before authentication.'),
  provider('google', 'Google Password Manager', 'google', 'https://support.google.com/chrome/answer/13168025', 'In this dedicated Chrome window, sign in to the Google account holding the original passkey and unlock Google Password Manager. Keep internet connected; Google may use its remote authenticator. Do not create or reset a passkey.'),
  provider('1password', '1Password', 'extension', 'https://support.1password.com/save-use-passkeys/', 'Install the official 1Password Chrome extension in this dedicated profile, then sign in and unlock it. Enable passkey sign-in. Keep internet available if the provider needs it.'),
  provider('bitwarden', 'Bitwarden', 'extension', 'https://bitwarden.com/help/storing-passkeys/', 'Install the official Bitwarden Chrome extension in this dedicated profile, then sign in, synchronize and unlock the vault holding the original passkey.'),
  provider('proton', 'Proton Pass', 'extension', 'https://proton.me/support/pass-use-passkeys', 'Install the official Proton Pass Chrome extension in this dedicated profile, then sign in and unlock the vault holding the original passkey.'),
  provider('dashlane', 'Dashlane', 'extension', 'https://support.dashlane.com/hc/en-us/articles/7888558064274-Passkeys-in-Dashlane', 'Install the official Dashlane Chrome extension in this dedicated profile, then sign in and unlock the vault holding the original passkey.'),
  provider('other', 'Other passkey manager', 'extension', null, 'Install only your trusted provider’s official Chrome extension in this dedicated profile, or use its browser-supported credential integration. Unlock the original passkey. Ordinary passwords cannot replace a passkey.'),
  provider('security-key', 'Hardware security key', 'offline', null, 'Connect the hardware key holding the original discoverable P-256 credential. Disconnect internet before authentication. Non-discoverable credentials are not currently supported.'),
  provider('phone', 'Passkey on another device', 'hybrid', 'https://support.google.com/chrome/answer/13168025', 'Choose a phone or tablet in the browser prompt. Keep Bluetooth and internet available as required by cross-device authentication. Use the original passkey, not a new credential.'),
]);
export function getPasskeyProvider(id = 'apple') {
  const found = PASSKEY_PROVIDERS.find(provider => provider.id === id);
  if (!found) throw Error('Choose a supported passkey provider.');
  return found;
}
