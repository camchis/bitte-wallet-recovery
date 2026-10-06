import { X509Certificate, createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRecoveryServer } from './server.mjs';
import { createSetupServer } from './setup-server.mjs';
import { ensureLocalTls } from './setup-local.mjs';
import { getPasskeyProvider } from './src/providers.js';
import { buildChromeArgs } from './browser-config.mjs';
import { launchGuardedBrowser } from './browser-process.mjs';

export async function findChrome() {
  for (const folder of ['/Applications', join(homedir(), 'Applications')]) {
    const executable = join(folder, 'Google Chrome.app/Contents/MacOS/Google Chrome');
    if (await access(executable).then(() => true, () => false)) return executable;
  }
  throw Error('Install Google Chrome in Applications, then reopen this app.');
}
export async function startDesktopSession({ dataDir, chromePath, status = () => {}, lookup, setupPort = 8787, recoveryPort = 8443, launch, providerId = 'apple' } = {}) {
  const provider = getPasskeyProvider(providerId);
  if (!dataDir) throw Error('Local data directory required.');
  process.umask(0o077);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await ensureLocalTls(join(dataDir, 'tls'));
  const cert = new X509Certificate(await readFile(join(dataDir, 'tls/cert.pem')));
  const spki = createHash('sha256').update(cert.publicKey.export({ format: 'der', type: 'spki' })).digest('base64');
  const profile = provider.id === 'apple' ? join(dataDir, 'chrome-profile') : join(dataDir, 'profiles', provider.id);
  await mkdir(join(profile, 'Default'), { recursive: true, mode: 0o700 });
  await writeFile(join(profile, 'Default/Preferences'), JSON.stringify({ download: { prompt_for_download: true }, credentials_enable_service: provider.id === 'google', profile: { password_manager_enabled: provider.id === 'google' } }), { flag: 'wx', mode: 0o600 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  let browser;
  let stopBrowser;
  let recoveryServer;
  let stopping = false;
  let stopPromise;
  const setupServer = await createSetupServer({ lookup, providerId: provider.id,
    async onPrepare(target) {
      if (stopping) throw Error('Session is stopping.');
      const candidate = await createRecoveryServer({ target, tlsDir: join(dataDir, 'tls'), providerId: provider.id });
      candidate.listen(recoveryPort, '127.0.0.1');
      try { await once(candidate, 'listening'); }
      catch (error) {
        candidate.close();
        if (!stopping) status(error.code === 'EADDRINUSE' ? 'RECOVERY_PORT_BUSY' : 'PREPARE_FAILED');
        throw error;
      }
      if (stopping) { candidate.closeAllConnections(); candidate.close(); throw Error('Session is stopping.'); }
      recoveryServer = candidate;
    },
    onSealed() { if (!stopping) status(provider.online ? 'PROVIDER_READY' : 'OFFLINE'); },
  });
  async function stop() {
    if (stopPromise) return stopPromise;
    stopping = true;
    stopPromise = (async () => {
      await Promise.all([setupServer, recoveryServer].filter(Boolean).map(server => new Promise(resolve => {
        server.close(() => resolve()); server.closeAllConnections();
      })));
      // Only the process we launched. Never kill another Chrome profile or erase storage.
      if (stopBrowser) {
        await stopBrowser();
      } else if (browser && browser.exitCode === null && browser.signalCode === null) {
        const exited = once(browser, 'exit').catch(() => {});
        browser.kill('SIGTERM');
        let timer;
        await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { browser.kill('SIGKILL'); resolve(); }, 5000); })]);
        clearTimeout(timer);
      }
    })();
    return stopPromise;
  }
  try {
    setupServer.listen(setupPort, '127.0.0.1');
    await once(setupServer, 'listening');
    const args = buildChromeArgs({ profile, spki, setup: true, providerId: provider.id });
    if (launch) { // Test-only browser substitutes retain the existing injection interface.
      browser = launch(chromePath, args, { stdio: 'ignore' });
      await once(browser, 'spawn');
    } else {
      const guarded = await launchGuardedBrowser(chromePath, args);
      browser = guarded.process;
      stopBrowser = guarded.stop;
    }
    const browserClosed = () => {
      if (!stopping) {
        status('BROWSER_CLOSED');
        void stop().catch(() => status('CLEANUP_FAILED'));
      }
    };
    browser.once('exit', browserClosed);
    if (browser.exitCode !== null || browser.signalCode !== null) throw Error('Dedicated browser closed during startup.');
    status('READY');
    return { setupServer, get recoveryServer() { return recoveryServer; }, stop };
  } catch (error) { await stop(); throw error; }
}
