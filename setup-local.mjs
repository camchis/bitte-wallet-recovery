import { mkdir, access, chmod, writeFile, readFile, rename } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { X509Certificate, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WALLET_DOMAINS } from './src/domains.js';
const root = fileURLToPath(new URL('.', import.meta.url));
export async function ensureLocalTls(dir = root + '.local/tls') {
  const exists = async file => access(file).then(() => true, () => false);
  const hasKey = await exists(dir + '/key.pem');
  const hasCert = await exists(dir + '/cert.pem');
  if (hasKey !== hasCert) throw Error('Partial TLS setup exists; refusing to overwrite it.');
  let backup = null;
  if (hasKey) {
    const cert = new X509Certificate(await readFile(dir + '/cert.pem'));
    if (Date.parse(cert.validTo) > Date.now() && WALLET_DOMAINS.every(domain => cert.checkHost(domain.rpId))) return { reused: true, backup };
    // Preserve old local TLS files. This never accesses Apple Keychain or browser storage.
    backup = dir + '.previous-' + randomUUID();
    await rename(dir, backup);
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const sans = WALLET_DOMAINS.map(domain => 'DNS:' + domain.rpId).join(',');
  await writeFile(dir + '/openssl.cnf', '[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=wallet.bitte.ai\n[v3]\nsubjectAltName=' + sans + '\n', { mode: 0o600 });
  const r = spawnSync(process.platform === 'darwin' ? '/usr/bin/openssl' : 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '30', '-config', dir + '/openssl.cnf', '-keyout', dir + '/key.pem', '-out', dir + '/cert.pem'], { stdio: 'ignore' });
  if (r.status !== 0) throw Error('Local certificate generation failed. Previous TLS files, if any, were preserved.');
  await chmod(dir + '/key.pem', 0o600);
  return { reused: false, backup };
}
if (process.argv[1]?.endsWith('/setup-local.mjs') && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o077);
  const result = await ensureLocalTls();
  console.log(result.reused ? 'Reusing local TLS certificate for both wallet domains.' : 'Created local TLS certificate for both wallet domains. No certificate was added to Apple Keychain.');
  if (result.backup) console.log('Previous local TLS files were preserved in a .local/tls.previous-* folder.');
}
