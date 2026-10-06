import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
export async function collectPublicFiles(root) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const files = new Set(['package.json', 'package-lock.json']);
  async function collect(path) {
    if (path.startsWith('/') || path.split('/').some(p => p === '..') || /[\r\n\0]/.test(path)) throw Error('Unsafe distribution path.');
    const stat = await lstat(join(root, path));
    if (stat.isSymbolicLink()) throw Error('Symlinks are not allowed in the distribution.');
    if (stat.isDirectory()) {
      for (const name of await readdir(join(root, path))) {
        if (name === '.DS_Store' || name.startsWith('._')) continue;
        await collect(path + '/' + name);
      }
    } else if (stat.isFile()) files.add(path);
    else throw Error('Unsupported distribution file.');
  }
  for (const path of pkg.files) await collect(path);
  return [...files].sort();
}
export async function validatePublicFiles(root, candidates, allowed) {
  const allowlist = new Set(allowed);
  for (const path of candidates) {
    if (!allowlist.has(path)) throw Error('Unapproved public file: ' + path);
    if (/(^|\/)(\.local|node_modules|dist|research|profiles|chrome-profile)(\/|$)|target\.json$|\.(pem|key|p12|pfx|zip|tgz|log)$|recovered/i.test(path)) throw Error('Private/generated material in public files: ' + path);
    if (!(await lstat(join(root, path))).isFile()) throw Error('Public files must be ordinary files: ' + path);
    const contents = await readFile(join(root, path), 'utf8');
    const patterns = [
      /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /\bed25519:[1-9A-HJ-NP-Za-km-z]{85,90}\b/,
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|AIza[A-Za-z0-9_-]{35})\b/,
    ];
    if (patterns.some(pattern => pattern.test(contents))) throw Error('Potential private material in public file: ' + path);
  }
}
export async function publicGitCandidates(root) {
  const top = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (top.status === 0 && resolve(top.stdout.trim()) === resolve(root)) {
    const result = spawnSync('git', ['-C', root, 'ls-files', '-c', '-o', '--exclude-standard', '-z'], { encoding: 'utf8', maxBuffer: 10_000_000 });
    if (result.status !== 0) throw Error('Could not inspect public Git files.');
    return [...new Set(result.stdout.split('\0').filter(Boolean))];
  }
  // Clean source archives have no Git metadata. Inspect all ordinary source entries.
  const paths = [];
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['.git', '.local', 'node_modules', 'dist', '.DS_Store'].includes(entry.name) || entry.name.startsWith('._')) continue;
      const path = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path + '/'); else paths.push(path);
    }
  }
  await walk(root);
  return paths;
}
