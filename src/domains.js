export const WALLET_DOMAINS = Object.freeze([
  Object.freeze({ rpId: 'wallet.bitte.ai', label: 'Bitte — wallet.bitte.ai', origin: 'https://wallet.bitte.ai:8443' }),
  Object.freeze({ rpId: 'wallet.mintbase.xyz', label: 'Mintbase — wallet.mintbase.xyz', origin: 'https://wallet.mintbase.xyz:8443' }),
]);
export function getWalletDomain(rpId) {
  const domain = WALLET_DOMAINS.find(domain => domain.rpId === rpId);
  if (!domain) throw Error('Choose an original passkey website from the supported list.');
  return domain;
}
