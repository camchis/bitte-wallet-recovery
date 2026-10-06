import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { syntheticCredential } from './synthetic-credential.mjs';
import { base58 } from '@scure/base';
import { fileURLToPath } from 'node:url';
import { ORIGIN, RP_ID } from '../src/recover.js';
import { PASSKEY_PROVIDERS } from '../src/providers.js';
import { WALLET_DOMAINS, getWalletDomain } from '../src/domains.js';
const hash = b => createHash('sha256').update(b).digest();
const key = syntheticCredential('UI-test-only-credential');
const { seed, publicBytes: pub } = key;
const publicKey = 'ed25519:' + base58.encode(pub);
const target = { accountId: 'synthetic.near', publicKey, blockHeight: 1, retrievedAt: '2026-10-06' };
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const compiled = (await build({ stdin: { contents: source, resolveDir: fileURLToPath(new URL('../src', import.meta.url)) }, bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].text;
function assertion(challenge, mismatch = false, rpId = RP_ID) {
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', origin: getWalletDomain(rpId).origin, challenge: Buffer.from(challenge).toString('base64url') }));
  const authenticatorData = Buffer.concat([hash(Buffer.from(rpId)), Buffer.from([5, 0, 0, 0, 1])]);
  const signature = (mismatch ? syntheticCredential('mismatched-test-only') : key).sign(Buffer.concat([authenticatorData, hash(clientDataJSON)]));
  const ab = b => Uint8Array.from(b).buffer;
  return { type: 'public-key', response: { clientDataJSON: ab(clientDataJSON), authenticatorData: ab(authenticatorData), signature: ab(signature), userHandle: ab(Buffer.from('synthetic')) } };
}
function page({ rpId = RP_ID, origin = getWalletDomain(rpId).origin, outcome = 'match', providerId = 'apple' } = {}) {
  const elements = new Map();
  for (const id of ['account', 'public-key', 'passkey-site', 'snapshot', 'environment', 'offline', 'recover', 'download', 'clear', 'status', 'provider', 'acknowledgement', 'finish-instructions']) elements.set(id, { checked: false, disabled: false, textContent: '', handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; } });
  const calls = [], blobs = [], links = [];
  const window = { RECOVERY_TARGET: { ...target, rpId }, RECOVERY_PROVIDER: providerId, isSecureContext: true, PublicKeyCredential: class {}, addEventListener() {} }; window.top = window;
  const navigator = { credentials: { async get(options) {
    calls.push(options);
    if (outcome === 'cancel') throw Object.assign(new Error(), { name: 'NotAllowedError' });
    return assertion(options.publicKey.challenge, outcome === 'mismatch', options.publicKey.rpId);
  } } };
  const document = { getElementById: id => elements.get(id), createElement: () => { const link = { click() { links.push(this); } }; return link; } };
  vm.runInNewContext(compiled, { window, location: { origin }, navigator, document, crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, AbortController, Blob, URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic'; }, revokeObjectURL() {} } });
  return { elements, calls, blobs, links, click: id => elements.get(id).handlers.click(), enable() { elements.get('offline').checked = true; elements.get('offline').handlers.change(); } };
}

test('UI requires offline acknowledgement and exact recovery origin', async () => {
  for (const origin of [ORIGIN, 'http://127.0.0.1:8787']) {
    const p = page({ origin });
    assert(p.elements.get('recover').disabled);
    await p.click('recover'); assert.equal(p.calls.length, 0);
    p.enable();
    assert.equal(p.elements.get('recover').disabled, origin !== ORIGIN);
    if (origin !== ORIGIN) { await p.click('recover'); assert.equal(p.calls.length, 0); }
  }
});

test('synthetic success enables explicit local export and release disables it', async () => {
  const p = page(); p.enable(); await p.click('recover');
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].publicKey.rpId, RP_ID);
  assert.equal(p.calls[0].publicKey.challenge.length, 128);
  assert.equal(p.elements.get('download').disabled, false);
  assert.equal(p.blobs.length, 0); // never auto-export
  p.click('download');
  const saved = JSON.parse(await p.blobs[0].text());
  assert.equal(saved.account_id, 'synthetic.near');
  assert.equal(saved.public_key, publicKey);
  assert.equal(saved.private_key, 'ed25519:' + base58.encode(Buffer.concat([seed, pub])));
  assert.equal(p.links[0].download, 'synthetic.near-recovered.json');
  p.click('clear'); assert(p.elements.get('download').disabled);
  p.click('download'); assert.equal(p.blobs.length, 1);
});

test('cancellation and nonmatching assertions never enable export', async () => {
  for (const outcome of ['cancel', 'mismatch']) {
    const p = page({ outcome }); p.enable(); await p.click('recover');
    assert(p.elements.get('download').disabled);
    assert.match(p.elements.get('status').textContent, outcome === 'cancel' ? /cancelled/ : /No match/);
    p.click('download'); assert.equal(p.blobs.length, 0);
  }
});

for (const domain of WALLET_DOMAINS) {
  test(`UI authenticates at ${domain.rpId} and refuses the other domain`, async () => {
    const p = page({ rpId: domain.rpId }); p.enable(); await p.click('recover');
    assert.equal(p.calls[0].publicKey.rpId, domain.rpId);
    assert.equal(p.elements.get('passkey-site').textContent, domain.rpId);
    assert.equal(p.elements.get('download').disabled, false);
    const other = WALLET_DOMAINS.find(d => d.rpId !== domain.rpId);
    const wrong = page({ rpId: domain.rpId, origin: other.origin }); wrong.enable(); await wrong.click('recover');
    assert(wrong.elements.get('recover').disabled);
    assert.equal(wrong.calls.length, 0);
  });
}

for (const provider of PASSKEY_PROVIDERS) {
  test(`provider ${provider.id}: acknowledgement, standard WebAuthn and local-only export`, async () => {
    const p = page({ providerId: provider.id });
    assert.equal(p.elements.get('provider').textContent, provider.label);
    assert(p.elements.get('recover').disabled);
    assert.match(p.elements.get('acknowledgement').textContent, provider.online ? /trusted passkey provider/ : /disconnected internet/);
    assert.match(p.elements.get('environment').textContent, provider.online ? /internet access may be required/ : /Disconnect this Mac/);
    p.enable(); await p.click('recover');
    assert.equal(p.calls.length, 1);
    assert.equal(p.calls[0].publicKey.rpId, RP_ID);
    assert.equal(p.calls[0].publicKey.allowCredentials.length, 0);
    assert.equal(p.blobs.length, 0);
    p.click('download');
    assert.equal(JSON.parse(await p.blobs[0].text()).public_key, publicKey);
    assert.equal(p.links[0].download, 'synthetic.near-recovered.json');
  });
}
