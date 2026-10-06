import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchGuardedBrowser } from '../browser-process.mjs';

async function waitFor(check, message, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(message);
}
async function alive(pid) {
  try { process.kill(pid, 0); } catch { return false; }
  // A reparented process can remain a zombie under a container's PID 1.
  if (process.platform === 'linux') {
    const stat = await readFile('/proc/' + pid + '/stat', 'utf8').catch(() => '');
    if (!stat || stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z')) return false;
  }
  return true;
}

for (const mode of ['normal', 'backend-killed', 'backend-killed-stubborn-browser']) {
  test(`browser supervisor: ${mode} closes only its owned process`, { timeout: 20000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bitte-guardian-test-'));
    const marker = join(dir, 'synthetic-process.json');
    const browserCode = `const fs = require('node:fs'); process.on('SIGTERM', () => { ${mode.endsWith('stubborn-browser') ? '' : 'process.exit(0);'} }); fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({pid: process.pid})); setInterval(() => {}, 1000);`;
    const code = `import { launchGuardedBrowser } from ${JSON.stringify(new URL('../browser-process.mjs', import.meta.url).href)};
      const owned = await launchGuardedBrowser(process.execPath, ['-e', ${JSON.stringify(browserCode)}]);
      process.on('message', async () => { await owned.stop(); await owned.stop(); process.exit(0); });
      process.send({guardianPid: owned.process.pid});`;
    const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    const backend = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let browserPid, guardianPid;
    try {
      const [ready] = await once(backend, 'message'); guardianPid = ready.guardianPid;
      await waitFor(async () => { try { browserPid = JSON.parse(await readFile(marker, 'utf8')).pid; return true; } catch { return false; } }, 'synthetic browser did not start');
      const ended = once(backend, 'exit');
      if (mode === 'normal') backend.send('STOP'); else backend.kill('SIGKILL');
      await ended;
      await waitFor(async () => !(await alive(browserPid)) && !(await alive(guardianPid)), 'owned browser/supervisor survived backend termination');
      assert(await alive(other.pid), 'unrelated process must be preserved');
    } finally {
      if (backend.exitCode === null && backend.signalCode === null) backend.kill('SIGKILL');
      other.kill('SIGTERM');
      if (browserPid && await alive(browserPid)) process.kill(browserPid, 'SIGKILL');
      if (guardianPid && await alive(guardianPid)) process.kill(guardianPid, 'SIGTERM');
    }
  });
}

test('browser supervisor rejects a failed browser spawn instead of reporting readiness', { timeout: 5000 }, async () => {
  await assert.rejects(launchGuardedBrowser('/nonexistent-synthetic-browser', []), /could not start/);
});
