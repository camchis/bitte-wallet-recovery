import test from 'node:test';
import assert from 'node:assert/strict';
import { base58 } from '@scure/base';
import { lookupAccount, parsePublicSnapshot, selectTarget, validateAccountId, RPC_ENDPOINT } from '../account.mjs';
const pk = 'ed25519:' + '1'.repeat(32);
const pk2 = 'ed25519:' + base58.encode(new Uint8Array(32).fill(2));
const response = { result: { block_height: 123, block_hash: 'synthetic-block-hash', keys: [
  { public_key: pk, access_key: { permission: 'FullAccess' } },
  { public_key: pk2, access_key: { permission: 'FullAccess' } },
  { public_key: pk, access_key: { permission: { FunctionCall: { receiver_id: 'example.near' } } } },
] } };

test('account validation accepts named/implicit IDs and rejects URLs, public keys and malformed IDs', () => {
  for (const account of ['example.near', 'sub.example.near', 'a_b-c.near', 'f'.repeat(64)]) assert.equal(validateAccountId(' '+account+' '), account);
  for (const account of ['', 'a', 'a'.repeat(65), 'Example.near', 'https://example.near', 'ed25519:key', 'foo..near', '-foo.near', 'foo-.near', 'foo._near']) assert.throws(() => validateAccountId(account));
});

test('public lookup sends only the supplied account ID in a read-only fixed-endpoint RPC', async () => {
  let called;
  const snapshot = await lookupAccount('different.near', { fetchImpl: async (url, options) => { called = { url, options }; return { ok: true, text: async () => JSON.stringify(response) }; } });
  assert.equal(called.url, RPC_ENDPOINT);
  const rpc = JSON.parse(called.options.body);
  assert.equal(rpc.method, 'query');
  assert.deepEqual(rpc.params, { request_type: 'view_access_key_list', finality: 'final', account_id: 'different.near' });
  assert.equal(snapshot.accountId, 'different.near');
  assert.deepEqual(snapshot.publicKeys, [pk, pk2]);
  assert.equal(selectTarget(snapshot, pk2, 'wallet.bitte.ai').publicKey, pk2);
  assert.throws(() => selectTarget(snapshot, 'ed25519:' + base58.encode(new Uint8Array(32).fill(3)), 'wallet.bitte.ai'), /Choose/);
});

test('nonexistent, malformed and accounts without usable full-access keys produce clear errors', () => {
  assert.throws(() => parsePublicSnapshot('missing.near', { error: { cause: { name: 'UNKNOWN_ACCOUNT' } } }), /not found/);
  assert.throws(() => parsePublicSnapshot('empty.near', { result: { ...response.result, keys: [] } }), /no active/);
  assert.throws(() => parsePublicSnapshot('example.near', { result: { ...response.result, keys: [{ public_key: 'ed25519:invalid!', access_key: { permission: 'FullAccess' } }] } }), /Invalid public key/);
  assert.throws(() => parsePublicSnapshot('example.near', {}), /Invalid public RPC/);
});
