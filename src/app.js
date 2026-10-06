import { recoverMatchingKey, encodeNearSecret } from './recover.js';
import { getPasskeyProvider } from './providers.js';
import { getWalletDomain } from './domains.js';
const target = window.RECOVERY_TARGET;
const domain = getWalletDomain(target.rpId);
const provider = getPasskeyProvider(window.RECOVERY_PROVIDER || 'apple');

const $ = id => document.getElementById(id);
let matched = null;
let active = false;
let controller = null;
let downloadUrl = null;
let clearedDuringRequest = false;
$('account').textContent = target.accountId;
$('public-key').textContent = target.publicKey;
$('passkey-site').textContent = domain.rpId;
$('provider').textContent = provider.label;
$('acknowledgement').textContent = provider.online
  ? 'I am using my trusted passkey provider on this device, and will save the recovered key outside cloud-synced folders.'
  : 'I have disconnected internet access, and will save any recovered key outside cloud-synced folders.';
$('finish-instructions').textContent = provider.online
  ? 'The recovered key stays in this page until you save it locally. Your passkey provider may contact its own services. Quit Recovery and close the dedicated browser when finished.'
  : 'Saving creates an unencrypted NEAR credential file. Quit Recovery and close the dedicated browser before reconnecting.';
$('snapshot').textContent = `Public chain snapshot: block ${target.blockHeight} · ${target.retrievedAt.slice(0, 10)}`;
const eligible = location.origin === domain.origin && window.isSecureContext && window.top === window && !!window.PublicKeyCredential && !!navigator.credentials?.get;
$('environment').textContent = eligible
  ? (provider.online ? 'Local origin ready. Keep your passkey provider unlocked; internet access may be required by the provider.' : 'Local origin ready. Disconnect this Mac from the internet before continuing.')
  : 'Preview only. Open this page using the supplied local Chrome launcher to enable recovery.';

function update() {
  $('recover').disabled = !eligible || !$('offline').checked || active || !!matched;
  $('download').disabled = !matched;
}
function clearMemory() {
  controller?.abort();
  if (active) clearedDuringRequest = true;
  matched?.secretBytes.fill(0);
  matched = null;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  update();
}
$('offline').addEventListener('change', update);
window.addEventListener('pagehide', clearMemory);
$('clear').addEventListener('click', () => {
  clearMemory();
  $('status').textContent = 'Recovered bytes released. Close this dedicated browser window when finished.';
});
$('recover').addEventListener('click', async () => {
  if (!eligible || !$('offline').checked || active || matched) return;
  active = true;
  clearedDuringRequest = false;
  controller = new AbortController();
  update();
  $('status').textContent = `Choose your existing passkey for this account at ${domain.rpId} and approve the browser prompt.`;
  const challenge = crypto.getRandomValues(new Uint8Array(128));
  let credential;
  try {
    // Authentication only. There is deliberately no credentials.create or registration flow.
    credential = await navigator.credentials.get({
      publicKey: { rpId: domain.rpId, challenge, allowCredentials: [], userVerification: 'preferred', timeout: 90000 },
      signal: controller.signal,
    });
    if (clearedDuringRequest) return;
    if (!credential || credential.type !== 'public-key') throw Error('No assertion');
    matched = recoverMatchingKey(credential.response, challenge, target.publicKey, domain.origin, domain.rpId);
    $('status').textContent = matched
      ? 'Match found: this key matches the saved FullAccess public key. You can now save the recovered NEAR key locally.'
      : 'No match to the saved FullAccess key. No key was saved. This may be a different passkey or a different historical derivation.';
  } catch (error) {
    // Do not log raw browser errors, credentials, assertions, or candidate key material.
    $('status').textContent = error?.name === 'NotAllowedError' || error?.name === 'AbortError'
      ? 'Authentication was cancelled, unavailable, or timed out. No key was saved.'
      : 'The assertion could not be validated or recovered. No key was saved.';
  } finally {
    challenge.fill(0);
    if (credential?.response) {
      for (const field of ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle']) {
        if (credential.response[field]) new Uint8Array(credential.response[field]).fill(0);
      }
    }
    credential = null;
    controller = null;
    active = false;
    update();
  }
});
$('download').addEventListener('click', () => {
  if (!matched) return;
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  const contents = JSON.stringify({ account_id: target.accountId, public_key: matched.publicKey, private_key: encodeNearSecret(matched.secretBytes) }, null, 2) + '\n';
  downloadUrl = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${target.accountId}-recovered.json`;
  link.click();
  // The browser may still retain copies; JavaScript cannot guarantee memory erasure.
  $('status').textContent = 'Local download requested. Save it in a folder that is not cloud-synced. This unencrypted file controls your wallet. Close this dedicated browser after saving.';
});
update();
