import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getPasskeyProvider } from './src/providers.js';
import { lookupAccount, selectTarget } from './account.mjs';
import { CSP } from './server.mjs';
import { getWalletDomain } from './src/domains.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const SETUP_CSP = CSP.replace("connect-src 'none'", "connect-src 'self'");
async function readInput(req, allowedKeys) {
  if (req.headers['content-type'] !== 'application/json') throw Error('Send a public account ID or public key as JSON.');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 512) throw Error('Input is too large.');
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('Invalid input.'); }
  if (!data || Array.isArray(data) || Object.keys(data).length !== allowedKeys.length || allowedKeys.some(key => typeof data[key] !== 'string')) throw Error('Only public account IDs, public keys and an original passkey website are accepted.');
  return data;
}
export async function createSetupServer({ lookup = lookupAccount, onPrepare, onSealed = () => {}, providerId = 'apple' } = {}) {
  const provider = getPasskeyProvider(providerId);
  if (typeof onPrepare !== 'function') throw Error('Recovery preparation callback required.');
  const files = new Map();
  for (const [route, name, type] of [['/', 'setup.html', 'text/html; charset=utf-8'], ['/setup.js', 'setup.js', 'text/javascript; charset=utf-8'], ['/style.css', 'style.css', 'text/css; charset=utf-8']]) {
    files.set(route, { body: await readFile(root + 'dist/' + name), type });
  }
  files.set('/provider.js', { type: 'text/javascript; charset=utf-8', body: Buffer.from("Object.defineProperty(window, 'RECOVERY_PROVIDER', { value: " + JSON.stringify(provider.id) + ", writable: false, configurable: false });\n") });
  let snapshot = null;
  let busy = false;
  let sealed = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', SETUP_CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'publickey-credentials-create=(), publickey-credentials-get=()');
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (!['127.0.0.1:8787', 'localhost:8787'].includes(req.headers.host)) { reply(421, { error: 'Unexpected local host.' }); return; }
    if (sealed) { reply(410, { error: 'Public lookup is closed for this recovery session.' }); return; }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const file = files.get(req.url);
      if (!file) { reply(404, { error: 'Not found.' }); return; }
      res.writeHead(200, { 'Content-Type': file.type }); res.end(req.method === 'HEAD' ? undefined : file.body); return;
    }
    if (req.method !== 'POST' || !['/lookup', '/prepare'].includes(req.url)) { reply(405, { error: 'Unsupported request.' }); return; }
    if (req.headers.origin !== 'http://' + req.headers.host) { reply(403, { error: 'Use the local setup page.' }); return; }
    if (busy) { reply(409, { error: 'Wait for the current public lookup or preparation to finish.' }); return; }
    busy = true;
    try {
      if (req.url === '/lookup') {
        snapshot = null;
        const { accountId } = await readInput(req, ['accountId']);
        snapshot = await lookup(accountId);
        reply(200, snapshot);
      } else {
        const { publicKey, rpId } = await readInput(req, ['publicKey', 'rpId']);
        const target = selectTarget(snapshot, publicKey, rpId);
        await onPrepare(target); // listener ready before browser navigates
        sealed = true;
        res.on('finish', () => setImmediate(() => {
          server.close(() => onSealed());
          server.closeIdleConnections();
        }));
        reply(200, { url: getWalletDomain(target.rpId).origin + '/' });
      }
    } catch (error) {
      if (req.url === '/prepare' && error.code === 'EADDRINUSE') {
        reply(409, { error: 'Recovery port 8443 is already in use. Close the other recovery session or application using it, then click Prepare recovery again.' });
        return;
      }
      const safeMessage = /^(Enter |Use a lowercase|This account|The public RPC|Public account lookup|Invalid public|Unsupported public key|Choose a FullAccess|Choose an original|Send a public|Input is too large|Invalid input|Only public)/.test(error.message)
        ? error.message : 'Could not prepare local recovery. Check the launcher status and try again.';
      reply(400, { error: safeMessage });
    } finally { busy = false; }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}
