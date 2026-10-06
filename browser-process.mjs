import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function launchGuardedBrowser(executable, args) {
  const guardian = spawn(process.execPath, [fileURLToPath(new URL('./browser-guardian.mjs', import.meta.url)), executable, ...args], {
    stdio: ['pipe', 'ignore', 'ignore', 'ipc'],
  });
  guardian.stdin.on('error', () => {}); // Closing/crashed guardian; exit below is authoritative.
  const exited = new Promise(resolve => {
    guardian.once('exit', (code, signal) => resolve({ code, signal }));
    guardian.once('error', () => resolve({ code: 1, signal: null }));
  });
  let stopPromise;
  function stop() {
    return stopPromise ||= (async () => {
      guardian.stdin.end();
      let timer;
      try {
        const result = await Promise.race([exited, new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('Browser cleanup could not be confirmed.')), 8000);
        })]);
        if (result.code !== 0 || result.signal) throw Error('Browser cleanup could not be confirmed.');
      } finally { clearTimeout(timer); }
    })();
  }
  let timer;
  let readyHandler;
  try {
    await Promise.race([
      new Promise(resolve => { readyHandler = message => { if (message === 'READY') resolve(); }; guardian.on('message', readyHandler); }),
      exited.then(() => { throw Error('Dedicated browser could not start.'); }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Dedicated browser startup timed out.')), 15000); }),
    ]);
    return { process: guardian, stop };
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    guardian.off('message', readyHandler);
  }
}
