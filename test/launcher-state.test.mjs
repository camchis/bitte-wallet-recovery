import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('native launcher reports exits after readiness, ignores stale status, and preserves specific startup failures', { skip: process.platform !== 'darwin' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bitte-launcher-state-'));
  const main = join(dir, 'main.swift');
  await writeFile(main, `
    for code in ["READY", "OFFLINE", "PROVIDER_READY", "RECOVERY_PORT_BUSY", "BROWSER_CLOSED"] {
        var state = LauncherState()
        precondition(state.receive(code) != nil)
        precondition(state.exited().contains("stopped unexpectedly"))
        precondition(state.message.contains("close any remaining windows manually"))
        precondition(state.receive("READY") == nil)
        precondition(state.code == "BACKEND_FAILED")
    }
    for code in ["CHROME_MISSING", "PORT_BUSY", "START_FAILED", "CLEANUP_FAILED"] {
        var state = LauncherState()
        let message = state.receive(code)
        precondition(state.exited() == message)
    }
    var state = LauncherState()
    _ = state.receive("READY")
    precondition(state.receive("RECOVERY_PORT_BUSY")!.contains("Prepare recovery again"))
    precondition(state.receive("OFFLINE")!.contains("Disconnect"))
    precondition(state.receive("START_FAILED")!.contains("Could not start"))
  `);
  const executable = join(dir, 'check-state');
  const compiled = spawnSync('/usr/bin/swiftc', [fileURLToPath(new URL('../macos/LauncherState.swift', import.meta.url)), main, '-o', executable], { encoding: 'utf8', timeout: 60000 });
  assert.equal(compiled.status, 0, compiled.stderr);
  const result = spawnSync(executable, [], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
});
