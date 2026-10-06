import { PASSKEY_PROVIDERS, getPasskeyProvider } from '../src/providers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChromeArgs } from '../browser-config.mjs';
import { WALLET_DOMAINS } from '../src/domains.js';
import { ensureLocalTls } from '../setup-local.mjs';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

test('browser maps only the two supported wallet domains and chooses the configured origin', () => {
  for (const domain of WALLET_DOMAINS) {
    const args = buildChromeArgs({ profile: '/tmp/synthetic-profile', spki: 'synthetic-spki', rpId: domain.rpId });
    assert.equal(args.at(-1), domain.origin + '/');
    const rules = args.find(arg => arg.startsWith('--host-resolver-rules='));
    for (const supported of WALLET_DOMAINS) assert(rules.includes('MAP ' + supported.rpId + ' 127.0.0.1'));
    assert(rules.endsWith('MAP * ~NOTFOUND'));
    assert(args.includes('--use-mock-keychain'));
    assert(args.includes('--disable-sync'));
  }
  assert.throws(() => buildChromeArgs({ profile: '', spki: '', rpId: 'untrusted.invalid' }), /Choose/);
});

test('TLS setup preserves a single-domain certificate and creates a reusable dual-domain certificate', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'bitte-synthetic-tls-'));
  const dir = join(parent, 'tls'); await mkdir(dir, { mode: 0o700 });
  await writeFile(dir + '/old.cnf', '[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=wallet.bitte.ai\n[v3]\nsubjectAltName=DNS:wallet.bitte.ai\n');
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', dir + '/old.cnf', '-keyout', dir + '/key.pem', '-out', dir + '/cert.pem'], { stdio: 'ignore' });
  assert.equal(r.status, 0);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const oldHash = hash(await readFile(dir + '/cert.pem'));
  const oldKeyHash = hash(await readFile(dir + '/key.pem'));
  const result = await ensureLocalTls(dir);
  assert(result.backup);
  assert.equal(hash(await readFile(result.backup + '/cert.pem')), oldHash);
  assert.equal(hash(await readFile(result.backup + '/key.pem')), oldKeyHash);
  const cert = new X509Certificate(await readFile(dir + '/cert.pem'));
  for (const domain of WALLET_DOMAINS) assert.equal(cert.checkHost(domain.rpId), domain.rpId);
  assert.equal(cert.checkHost('untrusted.invalid'), undefined);
  assert.equal((await ensureLocalTls(dir)).reused, true);
});

test('provider-aware browser permissions preserve RP mapping and isolate online/offline modes', () => {
  for (const provider of PASSKEY_PROVIDERS) {
    const args = buildChromeArgs({ profile: '/tmp/synthetic-' + provider.id, spki: 'synthetic', providerId: provider.id });
    const rules = args.find(arg => arg.startsWith('--host-resolver-rules='));
    assert(rules.includes('MAP wallet.bitte.ai 127.0.0.1'));
    assert(rules.includes('MAP wallet.mintbase.xyz 127.0.0.1'));
    assert.equal(rules.includes('MAP * ~NOTFOUND'), !provider.online);
    assert.equal(args.includes('--no-proxy-server'), provider.online);
    assert.equal(args.includes('--disable-extensions'), !provider.extensions);
    assert.equal(args.includes('--disable-sync'), provider.id !== 'google');
    assert(args.includes('--ignore-certificate-errors-spki-list=synthetic'));
    assert(!args.includes('--ignore-certificate-errors'));
  }
  assert.throws(() => getPasskeyProvider('unknown-provider'), /Choose/);
  assert.throws(() => buildChromeArgs({ providerId: 'unknown-provider' }), /Choose/);
});
