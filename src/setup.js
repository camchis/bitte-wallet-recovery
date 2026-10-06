import { getPasskeyProvider } from './providers.js';
import { WALLET_DOMAINS } from './domains.js';
const $ = id => document.getElementById(id);
const provider = getPasskeyProvider(window.RECOVERY_PROVIDER || 'apple');
$('provider-name').textContent = provider.label;
$('provider-instructions').textContent = provider.instructions;
$('provider-help').hidden = !provider.helpUrl;
if (provider.helpUrl) $('provider-help').href = provider.helpUrl;
for (const domain of WALLET_DOMAINS) {
  const option = document.createElement('option');
  option.value = domain.rpId; option.textContent = domain.label;
  $('domain-select').append(option);
}
let busy = false;
let prepared = false;
let currentAccount = '';
$('lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || prepared) return;
  busy = true;
  $('lookup').disabled = true;
  $('result').hidden = true;
  $('setup-status').textContent = 'Reading public access keys from NEAR mainnet…';
  try {
    const response = await fetch('/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: $('account-input').value }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Public lookup failed.');
    currentAccount = data.accountId;
    $('selected-account').textContent = data.accountId;
    $('key-select').replaceChildren();
    for (const publicKey of data.publicKeys) {
      const option = document.createElement('option');
      option.value = publicKey; option.textContent = publicKey;
      $('key-select').append(option);
    }
    $('selected-snapshot').textContent = `Snapshot: block ${data.blockHeight} · ${data.retrievedAt.slice(0, 10)}`;
    $('result').hidden = false;
    $('setup-status').textContent = `${data.publicKeys.length} active ed25519 FullAccess key${data.publicKeys.length === 1 ? '' : 's'} found.`;
  } catch (error) {
    $('setup-status').textContent = error.message;
  } finally { busy = false; $('lookup').disabled = false; }
});
$('account-input').addEventListener('input', () => { $('result').hidden = true; });
$('continue').addEventListener('click', async () => {
  if (busy || prepared || $('result').hidden || currentAccount !== $('account-input').value.trim()) return;
  busy = true;
  $('continue').disabled = true;
  $('lookup').disabled = true;
  $('setup-status').textContent = 'Starting the recovery page and closing public lookup…';
  try {
    const response = await fetch('/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: $('key-select').value, rpId: $('domain-select').value }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Could not prepare recovery.');
    prepared = true;
    location.assign(data.url);
  } catch (error) {
    $('setup-status').textContent = error.message;
    $('continue').disabled = false;
    $('lookup').disabled = false;
  } finally { busy = false; }
});
