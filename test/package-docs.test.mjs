import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyPackageDocumentation, checkDocumentationLinks } from '../scripts/package-docs.mjs';

test('packaged documentation resolves its relative links and rejects a missing provider document', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bitte-docs-test-'));
  await copyPackageDocumentation(fileURLToPath(new URL('../', import.meta.url)), dir);
  await checkDocumentationLinks(dir);
  await unlink(join(dir, 'docs/PROVIDERS.md'));
  await assert.rejects(checkDocumentationLinks(dir), /Broken packaged documentation link.*PROVIDERS/);
});
