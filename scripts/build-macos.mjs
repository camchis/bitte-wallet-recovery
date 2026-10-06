import { readFile, writeFile, mkdir, copyFile, chmod, mkdtemp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PASSKEY_PROVIDERS } from '../src/providers.js';
import { build } from 'esbuild';
import { copyPackageDocumentation } from './package-docs.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (process.platform !== 'darwin') throw Error('Build on macOS with Xcode Command Line Tools.');
const release = process.argv.includes('--release');
const identity = process.env.MACOS_SIGN_IDENTITY;
const notaryProfile = process.env.MACOS_NOTARY_PROFILE;
if (release && (!identity?.startsWith('Developer ID Application: ') || !notaryProfile)) throw Error('Release requires an existing MACOS_SIGN_IDENTITY (Developer ID Application) and MACOS_NOTARY_PROFILE. No preview signature will be substituted.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const nodeVersion = '22.23.3';
const runtimes = [
  { arch: 'arm64', sha256: '23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53' },
  { arch: 'x64', sha256: '8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8' },
];
function run(executable, args, env = process.env) {
  const result = spawnSync(executable, args, { stdio: 'inherit', env });
  if (result.error || result.status !== 0) throw Error('Packaging command failed: ' + executable);
}
run(process.execPath, ['scripts/check-public.mjs']);
run(process.execPath, ['build.mjs']);
await mkdir('.local/macos-build', { recursive: true, mode: 0o700 });
await mkdir('.local/runtime-cache', { recursive: true, mode: 0o700 });
const stage = await mkdtemp(join(root, '.local/macos-build/stage-'));
const app = join(stage, 'Bitte Local Recovery.app');
const contents = join(app, 'Contents');
const resources = join(contents, 'Resources');
await mkdir(join(contents, 'MacOS'), { recursive: true });
await mkdir(join(resources, 'dist'), { recursive: true });
await build({ entryPoints: ['macos/desktop-entry.mjs'], outfile: join(resources, 'backend.mjs'), bundle: true, platform: 'node', target: 'node22', format: 'esm', sourcemap: false, minify: false });
await copyFile('browser-guardian.mjs', join(resources, 'browser-guardian.mjs'));
for (const file of ['app.js', 'setup.js', 'index.html', 'setup.html', 'style.css', 'SHA256.json']) await copyFile(join(root, 'dist', file), join(resources, 'dist', file));
await copyFile('LICENSE', join(resources, 'LICENSE'));
await copyPackageDocumentation(root, resources);
await writeFile(join(resources, 'providers.json'), JSON.stringify(PASSKEY_PROVIDERS.map(({id, label}) => ({id, label})), null, 2) + '\n');
let notices = 'Bundled third-party libraries. Versions are pinned in the source package-lock.json.\n';
for (const name of ['@noble/curves', '@noble/hashes', '@scure/base']) notices += '\n=== ' + name + ' ===\n' + await readFile(join('node_modules', name, 'LICENSE'), 'utf8');
await writeFile(join(resources, 'THIRD_PARTY_LICENSES.txt'), notices);
for (const runtime of runtimes) {
  const filename = `node-v${nodeVersion}-darwin-${runtime.arch}.tar.gz`;
  const archive = join(root, '.local/runtime-cache', filename);
  let data = await readFile(archive).catch(() => null);
  if (!data) {
    const response = await fetch('https://nodejs.org/dist/v' + nodeVersion + '/' + filename, { redirect: 'error', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error('Could not download the pinned Node runtime.');
    data = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== runtime.sha256) throw Error('Node runtime checksum mismatch.');
    await writeFile(archive, data, { mode: 0o600, flag: 'wx' });
  }
  if (createHash('sha256').update(data).digest('hex') !== runtime.sha256) throw Error('Cached Node runtime checksum mismatch.');
  const extract = join(stage, 'node-' + runtime.arch);
  await mkdir(extract);
  const prefix = filename.slice(0, -7);
  run('/usr/bin/tar', ['-xzf', archive, '-C', extract, prefix + '/bin/node', prefix + '/LICENSE']);
  const destination = join(resources, 'runtime', runtime.arch);
  await mkdir(destination, { recursive: true });
  await copyFile(join(extract, prefix, 'bin/node'), join(destination, 'node'));
  await chmod(join(destination, 'node'), 0o755);
  await copyFile(join(extract, prefix, 'LICENSE'), join(destination, 'LICENSE'));
}
for (const arch of ['arm64', 'x86_64']) run('/usr/bin/swiftc', ['macos/Launcher.swift', 'macos/LauncherState.swift', '-O', '-target', arch + '-apple-macosx13.0', '-framework', 'AppKit', '-o', join(stage, 'launcher-' + arch)]);
run('/usr/bin/lipo', ['-create', join(stage, 'launcher-arm64'), join(stage, 'launcher-x86_64'), '-output', join(contents, 'MacOS/BitteLocalRecovery')]);
await writeFile(join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>BitteLocalRecovery</string>
<key>CFBundleIdentifier</key><string>org.bitte-local-recovery.launcher</string>
<key>CFBundleName</key><string>Bitte Local Recovery</string>
<key>CFBundleDisplayName</key><string>Bitte Local Recovery</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${pkg.version}</string>
<key>CFBundleVersion</key><string>${pkg.version}</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSMultipleInstancesProhibited</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>\n`);
// Sign nested runtimes explicitly before sealing the outer app.
const signingIdentity = release ? identity : '-';
for (const runtime of runtimes) {
  const flags = release ? ['--options', 'runtime', '--timestamp', '--entitlements', 'macos/node-entitlements.plist'] : [];
  run('/usr/bin/codesign', ['--force', '--sign', signingIdentity, ...flags, join(resources, 'runtime', runtime.arch, 'node')]);
}
run('/usr/bin/codesign', ['--force', '--sign', signingIdentity, ...(release ? ['--options', 'runtime', '--timestamp'] : []), app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
if (release) {
  const submission = join(stage, 'notarization-submission.zip');
  run('/usr/bin/ditto', ['-c', '-k', '--keepParent', '--norsrc', app, submission]);
  const result = spawnSync('/usr/bin/xcrun', ['notarytool', 'submit', submission, '--keychain-profile', notaryProfile, '--wait', '--output-format', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 3600000 });
  let response;
  try { response = JSON.parse(result.stdout); } catch { throw Error('Notarization did not return a valid result. No public release archive was created.'); }
  if (result.status !== 0 || response.status !== 'Accepted') throw Error('Notarization was not accepted. No public release archive was created.');
  run('/usr/bin/xcrun', ['stapler', 'staple', app]);
  run('/usr/bin/xcrun', ['stapler', 'validate', app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', app]);
}
const manifest = [];
async function collect(dir, prefix = '') {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + file.name;
    if (file.isDirectory()) await collect(join(dir, file.name), path + '/');
    else if (file.isFile()) {
      if (/(chrome-profile|\.local|target\.json|\.pem$|\.key$|recovered)/i.test(path)) throw Error('Local material in app bundle.');
      const bytes = await readFile(join(dir, file.name));
      if (/\.(mjs|js|html|md|json|plist|txt)$/.test(path) && bytes.includes(Buffer.from('/' + 'Users' + '/'))) throw Error('Personal path in app bundle.');
      manifest.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw Error('Unexpected bundle entry.');
  }
}
await collect(app);
const artifact = join(root, '.local', `${pkg.name}-${pkg.version}-macos-universal${release ? '' : '-preview'}.zip`);
run('/usr/bin/ditto', ['-c', '-k', '--keepParent', '--norsrc', app, artifact], { ...process.env, COPYFILE_DISABLE: '1' });
const zipHash = createHash('sha256').update(await readFile(artifact)).digest('hex');
await writeFile(artifact + '.sha256', zipHash + '  ' + artifact.split('/').at(-1) + '\n');
await writeFile(artifact + '.manifest.json', JSON.stringify({ version: pkg.version, releaseType: release ? 'notarized' : 'preview', nodeVersion, runtimes, files: manifest }, null, 2) + '\n');
console.log('App: ' + app);
console.log('Download archive: ' + artifact);
console.log(release ? 'Developer ID signature and notarization validated. Review device/provider validation before publishing.' : 'Preview only: ad-hoc signed; do not publish as a stable app release.');
