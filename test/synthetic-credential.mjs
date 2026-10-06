// Synthetic test fixtures only. Node/OpenSSL independently supplies public keys and signatures.
import { createHash, createECDH, createPrivateKey, createPublicKey, sign } from 'node:crypto';
export const hash = bytes => createHash('sha256').update(bytes).digest();
export function syntheticCredential(label) {
  const privateBytes = hash(Buffer.from(label));
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(privateBytes);
  const point = ecdh.getPublicKey(undefined, 'uncompressed');
  const privateKey = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url'), d: privateBytes.toString('base64url') }, format: 'jwk' });
  const seed = hash(point.subarray(1));
  const edPrivate = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const publicBytes = createPublicKey(edPrivate).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { point, seed, publicBytes, privateKey, sign: message => sign('sha256', message, privateKey) };
}
