import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('public app release fails closed without Developer ID/notarization credentials', { skip: process.platform !== 'darwin' }, () => {
  const env = { ...process.env };
  delete env.MACOS_SIGN_IDENTITY;
  delete env.MACOS_NOTARY_PROFILE;
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/build-macos.mjs', import.meta.url)), '--release'], { env, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release requires an existing MACOS_SIGN_IDENTITY/);
  assert.equal(result.stdout, ''); // no build/download/upload occurs before credential validation
});
