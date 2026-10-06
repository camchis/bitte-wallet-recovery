import { getPasskeyProvider } from './src/providers.js';
import { WALLET_DOMAINS, getWalletDomain } from './src/domains.js';
export function buildChromeArgs({ profile, spki, setup = false, rpId = 'wallet.bitte.ai', providerId = 'apple' }) {
  const domain = getWalletDomain(rpId);
  const provider = getPasskeyProvider(providerId);
  const mappings = WALLET_DOMAINS.map(domain => 'MAP ' + domain.rpId + ' 127.0.0.1').join(', ');
  const bypass = WALLET_DOMAINS.map(domain => domain.rpId).join(';');
  return [
    '--user-data-dir=' + profile,
    '--ignore-certificate-errors-spki-list=' + spki,
    '--host-resolver-rules=' + mappings + (provider.online ? '' : ', EXCLUDE 127.0.0.1, EXCLUDE localhost, MAP * ~NOTFOUND'),
    ...(provider.online ? ['--no-proxy-server'] : ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=' + bypass + ';127.0.0.1;localhost', '--disable-background-networking']),
    '--disable-quic',
    ...(provider.id === 'google' ? [] : ['--disable-sync']),
    ...(provider.extensions ? [] : ['--disable-extensions']),
    '--no-first-run', '--no-default-browser-check',
    '--disable-breakpad', '--disable-crash-reporter', '--disable-domain-reliability',
    // Chrome's OS-crypt safe storage uses a mock; Apple passkeys use WebAuthn only.
    '--use-mock-keychain', '--password-store=basic',
    '--new-window', setup ? 'http://127.0.0.1:8787/' : domain.origin + '/',
  ];
}
