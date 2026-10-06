import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { createSetupServer } from '../setup-server.mjs';
import { WALLET_DOMAINS } from '../src/domains.js';
const pk = 'ed25519:' + '1'.repeat(32);
const snapshot = { accountId: 'synthetic.near', publicKeys: [pk], blockHeight: 123, blockHash: 'synthetic', retrievedAt: '2026-10-06T00:00:00Z' };

for (const domain of WALLET_DOMAINS) {

test(`setup freezes ${domain.rpId}, rejects unsupported domains, then closes public lookup`, { timeout: 5000 }, async () => {
  const calls = [], targets = [];
  let resolveSealed;
  const sealed = new Promise(r => resolveSealed = r);
  const server = await createSetupServer({ lookup: async account => { calls.push(account); return snapshot; }, onPrepare: async target => targets.push(target), onSealed: resolveSealed });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  const query = (path, body, origin = 'http://127.0.0.1:8787', host = '127.0.0.1:8787') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: host, Origin: origin, 'Content-Type': 'application/json' } }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  try {
    const page = await query('/');
    assert.equal(page.status, 200);
    assert.match(page.headers['permissions-policy'], /publickey-credentials-get=\(\)/);
    assert.equal((await query('/lookup', { accountId: 'synthetic.near' }, 'https://external.invalid')).status, 403);
    assert.equal((await query('/lookup', { accountId: 'synthetic.near', private_key: 'synthetic-rejected-input' })).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await query('/lookup', { accountId: 'synthetic.near' })).status, 200);
    assert.deepEqual(calls, ['synthetic.near']);
    assert.equal((await query('/prepare', { publicKey: 'ed25519:' + '2'.repeat(43), rpId: domain.rpId })).status, 400);
    assert.equal((await query('/prepare', { publicKey: pk, rpId: 'arbitrary.invalid' })).status, 400);
    assert.equal(targets.length, 0);
    const prepared = await query('/prepare', { publicKey: pk, rpId: domain.rpId });
    assert.equal(prepared.status, 200);
    assert.equal(JSON.parse(prepared.body).url, domain.origin + '/');
    await sealed;
    assert.equal(server.listening, false);
    assert.equal(targets[0].accountId, 'synthetic.near');
    assert.equal(targets[0].rpId, domain.rpId);
    assert.equal(calls.length, 1);
    await assert.rejects(query('/lookup', { accountId: 'another.near' }));
  } finally { server.closeAllConnections(); if (server.listening) await new Promise(r => server.close(r)); }
});

}

test('lookup cannot race preparation or mutate a selected target during a pending request', { timeout: 5000 }, async () => {
  let release;
  const server = await createSetupServer({ lookup: () => new Promise(r => { release = () => r(snapshot); }), onPrepare: async () => {} });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const post = (path, data) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: 'POST', headers: { Host: '127.0.0.1:8787', Origin: 'http://127.0.0.1:8787', 'Content-Type': 'application/json' } }, res => {
      res.resume(); res.on('end', () => resolve({ status: res.statusCode }));
    }); req.on('error', reject); req.end(JSON.stringify(data));
  });
  try {
    const pending = post('/lookup', { accountId: 'synthetic.near' });
    for (let i = 0; !release && i < 100; i++) await new Promise(r => setTimeout(r, 5));
    assert(release, 'lookup must reach the injected public RPC');
    assert.equal((await post('/prepare', { publicKey: pk, rpId: 'wallet.bitte.ai' })).status, 409);
    release(); assert.equal((await pending).status, 200);
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
});
