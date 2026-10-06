import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { startDesktopSession } from '../desktop-session.mjs';
const snapshot = { accountId: 'synthetic.near', publicKeys: ['ed25519:' + '1'.repeat(32)], blockHeight: 1, blockHash: 'synthetic', retrievedAt: '2026-10-06T00:00:00Z' };
function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'POST', headers: { Host: '127.0.0.1:8787', Origin: 'http://127.0.0.1:8787', 'Content-Type': 'application/json' } }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
}
for (const rpId of ['wallet.bitte.ai', 'wallet.mintbase.xyz']) {
  test(`desktop ${rpId}: prepare, stop servers and owned browser, preserve profile`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'bitte-desktop-synthetic-'));
    const statuses = [];
    let browser;
    const launch = (_path, args, options) => {
      assert(args.includes('--user-data-dir=' + join(dataDir, 'chrome-profile')));
      assert.equal(options.stdio, 'ignore');
      browser = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options);
      return browser;
    };
    const session = await startDesktopSession({ dataDir, chromePath: 'mock', setupPort: 0, recoveryPort: 0, launch, lookup: async () => snapshot, status: code => statuses.push(code) });
    try {
      const port = session.setupServer.address().port;
      assert.equal((await post(port, '/lookup', { accountId: snapshot.accountId })).status, 200);
      const prepared = await post(port, '/prepare', { publicKey: snapshot.publicKeys[0], rpId });
      assert.equal(prepared.status, 200);
      assert.equal(prepared.body.url, 'https://' + rpId + ':8443/');
      assert(session.recoveryServer.listening);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(statuses, ['READY', 'OFFLINE']);
      const prefs = join(dataDir, 'chrome-profile/Default/Preferences');
      await writeFile(prefs, '{"synthetic_preserve":true}');
      await session.stop(); await session.stop();
      assert.equal(session.setupServer.listening, false);
      assert.equal(session.recoveryServer.listening, false);
      assert(browser.exitCode !== null || browser.signalCode !== null);
      const second = await startDesktopSession({ dataDir, chromePath: 'mock', setupPort: 0, launch });
      await second.stop();
      assert.equal(await readFile(prefs, 'utf8'), '{"synthetic_preserve":true}');
    } finally { await session.stop(); }
  });
}
test('desktop failed browser launch releases its listening port', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bitte-desktop-failure-'));
  await assert.rejects(startDesktopSession({ dataDir, chromePath: '/nonexistent-synthetic-browser', setupPort: 0 }));
});

test('recovery-port conflict reports a specific error and allows preparation retry with the same snapshot', async () => {
  const blocker = createServer(); blocker.listen(0, '127.0.0.1'); await once(blocker, 'listening');
  const recoveryPort = blocker.address().port;
  const dataDir = await mkdtemp(join(tmpdir(), 'bitte-port-conflict-'));
  const statuses = [];
  let lookups = 0;
  let session;
  try {
    session = await startDesktopSession({ dataDir, chromePath: 'mock', setupPort: 0, recoveryPort,
      launch: (_path, _args, options) => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options),
      lookup: async () => { lookups++; return snapshot; }, status: code => statuses.push(code),
    });
    const port = session.setupServer.address().port;
    await post(port, '/lookup', { accountId: snapshot.accountId });
    const body = { publicKey: snapshot.publicKeys[0], rpId: 'wallet.bitte.ai' };
    const failed = await post(port, '/prepare', body);
    assert.equal(failed.status, 409);
    assert.match(failed.body.error, /port 8443.*Prepare recovery again/);
    assert.deepEqual(statuses, ['READY', 'RECOVERY_PORT_BUSY']);
    assert(session.setupServer.listening);
    await new Promise(resolve => blocker.close(resolve));
    assert.equal((await post(port, '/prepare', body)).status, 200);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(lookups, 1);
    assert.equal(statuses.at(-1), 'OFFLINE');
    assert(session.recoveryServer.listening);
  } finally {
    if (session) await session.stop();
    if (blocker.listening) await new Promise(resolve => blocker.close(resolve));
  }
});

for (const providerId of ['google', '1password', 'bitwarden', 'proton', 'dashlane', 'other', 'phone', 'security-key']) {
  test(`desktop ${providerId}: isolated profile, frozen provider config and stopped public lookup`, async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'bitte-provider-synthetic-'));
    const statuses = [];
    const launch = (_path, args, options) => {
      assert(args.includes('--user-data-dir=' + join(dataDir, 'profiles', providerId)));
      return spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options);
    };
    const session = await startDesktopSession({ dataDir, providerId, chromePath: 'mock', setupPort: 0, recoveryPort: 0, launch, lookup: async () => snapshot, status: code => statuses.push(code) });
    try {
      const port = session.setupServer.address().port;
      const config = await new Promise((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path: '/provider.js', headers: { Host: '127.0.0.1:8787' } }, res => {
          let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }); req.on('error', reject); req.end();
      });
      assert.equal(config.status, 200);
      const text = config.body;
      assert(text.includes(JSON.stringify(providerId)));
      assert(text.includes('writable: false'));
      assert.equal(config.headers['permissions-policy'], 'publickey-credentials-create=(), publickey-credentials-get=()');
      await post(port, '/lookup', { accountId: snapshot.accountId });
      const prepared = await post(port, '/prepare', { publicKey: snapshot.publicKeys[0], rpId: 'wallet.bitte.ai' });
      assert.equal(prepared.status, 200);
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(statuses, ['READY', providerId === 'security-key' ? 'OFFLINE' : 'PROVIDER_READY']);
      const cert = await readFile(join(dataDir, 'tls/cert.pem'));
      const recoveryQuery = (path, method = 'GET') => new Promise((resolve, reject) => {
        const req = httpsRequest({ hostname: '127.0.0.1', port: session.recoveryServer.address().port, servername: 'wallet.bitte.ai', ca: cert, path, method, headers: { Host: 'wallet.bitte.ai:8443' } }, res => {
          let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }); req.on('error', reject); req.end();
      });
      const targetConfig = await recoveryQuery('/target.js');
      assert.equal(targetConfig.status, 200);
      assert(targetConfig.body.includes('RECOVERY_PROVIDER'));
      assert(targetConfig.body.includes(JSON.stringify(providerId)));
      assert.match(targetConfig.headers['content-security-policy'], /connect-src 'none'/);
      assert.equal((await recoveryQuery('/target.js', 'POST')).status, 405);
      assert.equal((await recoveryQuery('/upload', 'POST')).status, 405);
      assert.equal((await recoveryQuery('/profiles/' + providerId)).status, 404);

      const prefs = JSON.parse(await readFile(join(dataDir, 'profiles', providerId, 'Default/Preferences'), 'utf8'));
      assert.equal(prefs.credentials_enable_service, providerId === 'google');
    } finally { await session.stop(); }
  });
}
