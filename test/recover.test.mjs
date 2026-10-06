import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { p256 } from '@noble/curves/nist.js';
import { syntheticCredential } from './synthetic-credential.mjs';
import { base58 } from '@scure/base';
import { recoverMatchingKey, encodeNearSecret, ORIGIN, RP_ID } from '../src/recover.js';
import { WALLET_DOMAINS, getWalletDomain } from '../src/domains.js';

const hash = b => createHash('sha256').update(b).digest();
// All inputs below are synthetic. No credential API, account transaction, or user secret.
function fixture(index = 1, flags = 5, rpId = RP_ID) {
  const key = syntheticCredential('synthetic-p256-' + index);
  const { point, seed, publicBytes } = key;
  assert.equal(point.length, 65);
  assert.equal(point[0], 4);
  const challenge = hash(Buffer.from('synthetic-challenge-' + index));
  const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', origin: getWalletDomain(rpId).origin, challenge: challenge.toString('base64url'), crossOrigin: false }));
  const authenticatorData = Buffer.concat([hash(Buffer.from(rpId)), Buffer.from([flags, 0, 0, 0, index])]);
  const message = Buffer.concat([authenticatorData, hash(clientDataJSON)]);
  const digest = hash(message);
  const signature = key.sign(message);
  return { key, point, seed, publicBytes, challenge, message, digest, response: { clientDataJSON, authenticatorData, signature }, target: 'ed25519:' + base58.encode(publicBytes) };
}

test('32 fixtures reproduce historical registration and both recovery candidates', () => {
  const bits = new Set();
  const sForms = new Set();
  for (let i = 1; i <= 32; i++) {
    const f = fixture(i);
    const sig = p256.Signature.fromDER(f.response.signature);
    for (const bit of [0, 1]) {
      if (Buffer.from(sig.addRecoveryBit(bit).recoverPublicKey(f.digest).toRawBytes(false)).equals(f.point)) bits.add(bit);
    }
    // Include the valid high-S counterpart to exercise both historical encodings.
    const n = p256.CURVE.n;
    const mirror = new p256.Signature(sig.r, n - sig.s).toDERRawBytes();
    const signatures = [f.response.signature, mirror, f.key.sign(f.message)];
    for (const signature of signatures) {
      const parsed = p256.Signature.fromDER(signature);
      sForms.add(parsed.s > n / 2n ? 'high' : 'low');
      assert(verify('sha256', f.message, createPublicKey(f.key.privateKey), signature));
      const result = recoverMatchingKey({ ...f.response, signature }, f.challenge, f.target);
      assert(result);
      assert.deepEqual(Buffer.from(result.secretBytes), Buffer.concat([f.seed, f.publicBytes]));
      assert.equal(encodeNearSecret(result.secretBytes), 'ed25519:' + base58.encode(Buffer.concat([f.seed, f.publicBytes])));
      // Independent OpenSSL ed25519 derivation from the recovered seed.
      const edPrivate = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), f.seed]), format: 'der', type: 'pkcs8' });
      assert.deepEqual(createPublicKey(edPrivate).export({ format: 'der', type: 'spki' }).subarray(-32), f.publicBytes);
    }
  }
  assert.deepEqual([...bits].sort(), [0, 1]);
  assert.deepEqual([...sForms].sort(), ['high', 'low']);
});

test('mismatched key returns no recovered material', () => {
  const f = fixture();
  assert.equal(recoverMatchingKey(f.response, f.challenge, fixture(2).target), null);
});

test('rejects wrong challenge, origin, RP hash, missing presence, malformed signature', () => {
  const f = fixture();
  assert.throws(() => recoverMatchingKey(f.response, new Uint8Array(32), f.target), /Challenge/);
  assert.throws(() => recoverMatchingKey(f.response, f.challenge, f.target, 'https://elsewhere.invalid'), /origin/);
  const wrongRp = Buffer.from(f.response.authenticatorData); wrongRp[0] ^= 1;
  assert.throws(() => recoverMatchingKey({ ...f.response, authenticatorData: wrongRp }, f.challenge, f.target), /RP ID/);
  const noPresence = fixture(1, 4);
  assert.throws(() => recoverMatchingKey(noPresence.response, noPresence.challenge, noPresence.target), /presence/);
  assert.throws(() => recoverMatchingKey({ ...f.response, signature: new Uint8Array([1, 2]) }, f.challenge, f.target));
  const wrongType = Buffer.from(f.response.clientDataJSON.toString().replace('webauthn.get', 'webauthn.create'));
  assert.throws(() => recoverMatchingKey({ ...f.response, clientDataJSON: wrongType }, f.challenge, f.target), /type/);
});

test('preferred user verification accepts presence-only historical credentials', () => {
  const f = fixture(1, 1);
  assert.equal(recoverMatchingKey(f.response, f.challenge, f.target).userVerified, false);
});

test('tampered signed bytes cannot match the original NEAR key', () => {
  const f = fixture();
  const changed = Buffer.from(f.response.authenticatorData); changed[36] ^= 1;
  assert.equal(recoverMatchingKey({ ...f.response, authenticatorData: changed }, f.challenge, f.target), null);
});

for (const domain of WALLET_DOMAINS) {
  test(`recovers synthetic ${domain.rpId} assertions and rejects cross-domain origin/RP hash`, () => {
    for (let i = 1; i <= 8; i++) {
      const f = fixture(i, 5, domain.rpId);
      const result = recoverMatchingKey(f.response, f.challenge, f.target, domain.origin, domain.rpId);
      assert.deepEqual(Buffer.from(result.secretBytes), Buffer.concat([f.seed, f.publicBytes]));
      const other = WALLET_DOMAINS.find(d => d.rpId !== domain.rpId);
      assert.throws(() => recoverMatchingKey(f.response, f.challenge, f.target, other.origin, other.rpId), /origin/);
      const wrongRp = Buffer.from(f.response.authenticatorData);
      hash(Buffer.from(other.rpId)).copy(wrongRp, 0);
      assert.throws(() => recoverMatchingKey({ ...f.response, authenticatorData: wrongRp }, f.challenge, f.target, domain.origin, domain.rpId), /RP ID/);
      assert.throws(() => recoverMatchingKey(f.response, f.challenge, f.target, domain.origin, other.rpId), /origin or RP/);
    }
  });
}
