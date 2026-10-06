import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { collectPublicFiles, validatePublicFiles } from './public-files.mjs';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(root + 'package.json', 'utf8'));
const files = await collectPublicFiles(root);
await validatePublicFiles(root, files, files);
const manifest = [];
for (const path of [...files].sort()) {
  if (/(^|\/)(\.local|node_modules|dist|research)(\/|$)|target\.json$|\.(pem|key|tgz)$|recovered/i.test(path)) throw Error('Local or recovered material is in the distribution file list.');
  const data = await readFile(root + path);
  if (data.includes(Buffer.from('/' + 'Users' + '/'))) throw Error('An absolute personal path is in a distribution file.');
  manifest.push({ path, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
await mkdir(root + '.local', { recursive: true, mode: 0o700 });
await writeFile(root + '.local/shareable-manifest.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
if (process.argv.includes('--archive')) {
  const list = root + '.local/shareable-files.txt';
  await writeFile(list, manifest.map(f => f.path).join('\n') + '\n', { mode: 0o600 });
  const archive = root + '.local/' + pkg.name + '-' + pkg.version + '.tar.gz';
  const r = spawnSync('tar', ['-czf', archive, '-C', root, '-T', list], { stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } });
  if (r.status) throw Error('Archive creation failed.');
  console.log('Created: .local/' + pkg.name + '-' + pkg.version + '.tar.gz');
}
console.log(`Checked ${manifest.length} explicitly allowlisted distribution files. Local profiles, certificates, account snapshots, and recovered files are excluded.`);
