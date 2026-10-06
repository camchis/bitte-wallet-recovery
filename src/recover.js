import { p256 } from '@noble/curves/nist.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, equalBytes } from '@noble/curves/abstract/utils.js';
import { base58, base64urlnopad } from '@scure/base';
import { getWalletDomain } from './domains.js';

export const RP_ID = 'wallet.bitte.ai';
export const ORIGIN = 'https://wallet.bitte.ai:8443';
const utf8 = new TextEncoder();

// Production evidence: modules 30541.getKeys and 32222.recoverPublicKey.
// Only the NEAR public key is safe to disclose; P-256 points hash to wallet seeds.
export function recoverMatchingKey(response, challenge, targetPublicKey, origin = ORIGIN, rpId = RP_ID) {
  if (getWalletDomain(rpId).origin !== origin) throw Error('Unexpected assertion origin or RP ID');
  const auth = new Uint8Array(response.authenticatorData);
  const clientBytes = new Uint8Array(response.clientDataJSON);
  if (auth.length < 37 || auth.length > 4096 || clientBytes.length > 8192) throw Error('Invalid assertion size');
  const client = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clientBytes));
  if (client.type !== 'webauthn.get' || client.origin !== origin || client.crossOrigin === true) throw Error('Unexpected assertion origin or type');
  if (client.challenge !== base64urlnopad.encode(challenge)) throw Error('Challenge mismatch');
  if (!equalBytes(auth.subarray(0, 32), sha256(utf8.encode(rpId)))) throw Error('RP ID mismatch');
  if (!(auth[32] & 1)) throw Error('User presence missing');
  // User verification was preferred, not required, in the historical application.
  const digest = sha256(concatBytes(auth, sha256(clientBytes)));
  const signature = p256.Signature.fromDER(new Uint8Array(response.signature));
  let match = null;
  for (const bit of [0, 1]) {
    const point = signature.addRecoveryBit(bit).recoverPublicKey(digest).toRawBytes(false);
    if (!p256.verify(signature, digest, point, { lowS: false, prehash: false })) throw Error('Invalid signature');
    const seed = sha256(point.subarray(1));
    const publicBytes = ed25519.getPublicKey(seed);
    const publicKey = 'ed25519:' + base58.encode(publicBytes);
    if (publicKey === targetPublicKey) {
      match = { publicKey, secretBytes: concatBytes(seed, publicBytes), userVerified: !!(auth[32] & 4) };
    }
    seed.fill(0);
    point.fill(0);
  }
  return match;
}

export function encodeNearSecret(secretBytes) {
  if (secretBytes.length !== 64) throw Error('Invalid NEAR key length');
  return 'ed25519:' + base58.encode(secretBytes);
}
