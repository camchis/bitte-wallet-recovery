import { base58 } from '@scure/base';
import { getWalletDomain } from './src/domains.js';

export const RPC_ENDPOINT = 'https://rpc.mainnet.near.org';
export function validateAccountId(input) {
  if (typeof input !== 'string') throw Error('Enter a NEAR mainnet account ID.');
  const accountId = input.trim();
  if (accountId.length < 2 || accountId.length > 64 || !/^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/.test(accountId)) {
    throw Error('Use a lowercase NEAR account ID, such as example.near, or a 64-character implicit account ID.');
  }
  return accountId;
}
export function validatePublicKey(publicKey) {
  if (typeof publicKey !== 'string' || !publicKey.startsWith('ed25519:')) throw Error('Unsupported public key.');
  let bytes;
  try { bytes = base58.decode(publicKey.slice(8)); } catch { throw Error('Invalid public key.'); }
  if (bytes.length !== 32) throw Error('Invalid public key.');
  return publicKey;
}
export function parsePublicSnapshot(accountId, response, retrievedAt = new Date().toISOString()) {
  validateAccountId(accountId);
  if (response?.error) {
    if (response.error.cause?.name === 'UNKNOWN_ACCOUNT' || /does not exist/i.test(response.error.data || '')) throw Error('This account was not found on NEAR mainnet.');
    throw Error('The public RPC could not return this account. Try again later.');
  }
  const result = response?.result;
  if (!result || !Number.isSafeInteger(result.block_height) || result.block_height < 0 || typeof result.block_hash !== 'string' || !Array.isArray(result.keys) || result.keys.length > 10000) throw Error('Invalid public RPC response.');
  const publicKeys = [...new Set(result.keys.filter(k => k.access_key?.permission === 'FullAccess' && k.public_key?.startsWith('ed25519:')).map(k => validatePublicKey(k.public_key)))];
  if (!publicKeys.length) throw Error('This account has no active ed25519 FullAccess key to compare against.');
  return { accountId, publicKeys, blockHeight: result.block_height, blockHash: result.block_hash, retrievedAt };
}
export async function lookupAccount(input, { fetchImpl = fetch } = {}) {
  const accountId = validateAccountId(input);
  let response;
  try {
    response = await fetchImpl(RPC_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'public-access-keys', method: 'query', params: { request_type: 'view_access_key_list', finality: 'final', account_id: accountId } }),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) throw Error();
    const text = await response.text();
    if (text.length > 2_000_000) throw Error();
    return parsePublicSnapshot(accountId, JSON.parse(text));
  } catch (error) {
    if (/^(This account|The public RPC|Invalid public RPC|Invalid public key|Unsupported public key)/.test(error.message)) throw error;
    throw Error('Public account lookup failed. Check internet access and try again.');
  }
}
export function selectTarget(snapshot, publicKey, rpId) {
  getWalletDomain(rpId);
  validatePublicKey(publicKey);
  if (!snapshot?.publicKeys?.includes(publicKey)) throw Error('Choose a FullAccess key from the latest account lookup.');
  return { accountId: snapshot.accountId, publicKey, rpId, blockHeight: snapshot.blockHeight, blockHash: snapshot.blockHash, retrievedAt: snapshot.retrievedAt };
}
export function validateTarget(target) {
  getWalletDomain(target?.rpId);
  validateAccountId(target?.accountId);
  validatePublicKey(target?.publicKey);
  if (!Number.isSafeInteger(target.blockHeight) || !Number.isFinite(Date.parse(target.retrievedAt))) throw Error('Invalid public target.');
  return { accountId: target.accountId, publicKey: target.publicKey, rpId: target.rpId, blockHeight: target.blockHeight, blockHash: target.blockHash || '', retrievedAt: target.retrievedAt };
}
