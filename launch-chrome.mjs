import { X509Certificate, createHash } from 'node:crypto';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPasskeyProvider } from './src/providers.js';
import { buildChromeArgs } from './browser-config.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
if (process.platform !== 'darwin') throw Error('This launcher currently supports macOS only.');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chrome);
const cert = new X509Certificate(await readFile(root + '.local/tls/cert.pem'));
if (Date.parse(cert.validTo) <= Date.now()) throw Error('The local certificate expired. Existing TLS files were left untouched.');
const spki = createHash('sha256').update(cert.publicKey.export({ format: 'der', type: 'spki' })).digest('base64');
const provider = getPasskeyProvider(process.argv.find(arg => arg.startsWith('--provider='))?.slice(11) || 'apple');
const profile = provider.id === 'apple' ? root + '.local/chrome-profile' : root + '.local/profiles/' + provider.id;
await mkdir(profile + '/Default', { recursive: true, mode: 0o700 });
// Only initialize our new profile. Never replace existing preferences or clear storage.
await writeFile(profile + '/Default/Preferences', JSON.stringify({
  download: { prompt_for_download: true },
  credentials_enable_service: provider.id === 'google',
  profile: { password_manager_enabled: provider.id === 'google' },
}), { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
const args = buildChromeArgs({ profile, spki, providerId: provider.id, setup: process.argv.includes('--setup'), rpId: process.argv.find(arg => arg.startsWith('--domain='))?.slice(9) || 'wallet.bitte.ai' });
if (process.argv.includes('--print-only')) {
  console.log(JSON.stringify({ executable: chrome, args }, null, 2));
} else {
  const child = spawn(chrome, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.error('Chrome could not launch.'));
  child.unref();
  console.log(provider.online ? 'Opened the dedicated provider profile. Provider authentication can use internet; the NEAR key is reconstructed on this device.' : 'Opened the dedicated local Chrome profile. Disconnect internet before using the passkey.');
}
