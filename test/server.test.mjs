import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createRecoveryServer } from '../server.mjs';
import { WALLET_DOMAINS } from '../src/domains.js';
for (const domain of WALLET_DOMAINS) {

test(`TLS ${domain.rpId} server validates certificate, blocks uploads/other domains, and serves restrictive headers`, async () => {
  const target = { accountId: 'synthetic.near', rpId: domain.rpId, publicKey: 'ed25519:' + '1'.repeat(32), blockHeight: 1, retrievedAt: '2026-10-06T00:00:00Z' };
  const server = await createRecoveryServer({ target });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const ca = await readFile(new URL('../.local/tls/cert.pem', import.meta.url));
  const query = (path, method = 'GET', host = domain.rpId + ':8443') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, servername: domain.rpId, ca, method, path, headers: { Host: host } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
  try {
    const page = await query('/');
    assert.equal(page.status, 200);
    assert.match(page.body, /Use existing passkey/);
    assert.match(page.headers['content-security-policy'], /connect-src 'none'/);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(page.headers['cache-control'], 'no-store');
    assert.equal(page.headers['permissions-policy'], 'publickey-credentials-create=(), publickey-credentials-get=(self)');
    assert.equal((await query('/', 'POST')).status, 405);
    assert.equal((await query('/.local/tls/key.pem')).status, 404);
    assert.equal((await query('/?anything=1')).status, 404);
    assert.equal((await query('/', 'GET', 'unexpected.invalid')).status, 421);
    assert.equal((await query('/app.js')).status, 200);
    const config = await query('/target.js');
    assert.equal(config.status, 200);
    assert.match(config.body, /synthetic.near/);
    assert(config.body.includes(domain.rpId));
    const other = WALLET_DOMAINS.find(d => d.rpId !== domain.rpId);
    assert.equal((await query('/', 'GET', other.rpId + ':8443')).status, 421);
    assert.equal((await query('/lookup', 'POST')).status, 405);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});

}
