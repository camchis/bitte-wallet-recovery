import https from 'node:https';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { getPasskeyProvider } from './src/providers.js';
import { validateTarget } from './account.mjs';
import { getWalletDomain } from './src/domains.js';
const root = fileURLToPath(new URL('.', import.meta.url));
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src data:; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export async function createRecoveryServer({ preview = false, target, tlsDir = root + '.local/tls', providerId = 'apple' } = {}) {
  target = validateTarget(target);
  const provider = getPasskeyProvider(providerId);
  const domain = getWalletDomain(target.rpId);
  const files = new Map();
  for (const [route, name, type] of [['/', 'index.html', 'text/html; charset=utf-8'], ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/style.css', 'style.css', 'text/css; charset=utf-8']]) {
    files.set(route, { body: await readFile(root + 'dist/' + name), type });
  }
  files.set('/target.js', { type: 'text/javascript; charset=utf-8', body: Buffer.from("Object.defineProperty(window, 'RECOVERY_TARGET', { value: Object.freeze(" + JSON.stringify(target).replaceAll('<', '\\u003c') + "), writable: false, configurable: false });\nObject.defineProperty(window, 'RECOVERY_PROVIDER', { value: " + JSON.stringify(provider.id) + ", writable: false, configurable: false });\n") });
  const handle = (req, res) => {
    // No request logging, body parser, cookies, uploads, or external calls.
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'publickey-credentials-create=(), publickey-credentials-get=(self)');
    const allowedHosts = preview ? ['127.0.0.1:8787', 'localhost:8787'] : [domain.rpId + ':8443'];
    if (!allowedHosts.includes(req.headers.host)) { res.writeHead(421); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const file = files.get(req.url); // query strings and arbitrary paths are refused
    if (!file) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.type);
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : file.body);
  };
  const server = preview ? http.createServer(handle) : https.createServer({
    key: await readFile(tlsDir + '/key.pem'),
    cert: await readFile(tlsDir + '/cert.pem'),
    minVersion: 'TLSv1.2',
  }, handle);
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.on('clientError', (_error, socket) => socket.destroy());
  return server;
}
if (process.argv[1]?.endsWith('/server.mjs') && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const preview = process.argv.includes('--preview');
  const target = JSON.parse(await readFile(root + '.local/target.json', 'utf8'));
  const server = await createRecoveryServer({ preview, target });
  server.on('error', error => { console.error('Local server could not start:', error.code); process.exitCode = 1; });
  server.listen(preview ? 8787 : 8443, '127.0.0.1', () => console.log(preview ? 'Preview only: http://127.0.0.1:8787 (recovery disabled)' : 'Recovery server listening on loopback port 8443. Use launch-chrome.mjs; disconnect internet before authentication.'));
}
