import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';

export const DOCUMENTATION_FILES = Object.freeze(['README.md', 'SECURITY.md', 'docs/MACOS.md', 'docs/PROVIDERS.md', 'docs/IMPLEMENTATION.md', 'CONTRIBUTING.md', 'RECOVERY_NOTES.md', 'docs/RELEASING.md']);

export async function checkDocumentationLinks(root) {
  for (const file of DOCUMENTATION_FILES) {
    const contents = await readFile(resolve(root, file), 'utf8');
    for (const [, link] of contents.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(link)) continue;
      const target = resolve(root, dirname(file), decodeURIComponent(link.split('#')[0]));
      const path = relative(resolve(root), target);
      if (isAbsolute(path) || path === '..' || path.startsWith('..' + sep) || !(await stat(target).catch(() => null))?.isFile()) {
        throw Error('Broken packaged documentation link: ' + file + ' -> ' + link);
      }
    }
  }
}

export async function copyPackageDocumentation(source, destination) {
  for (const file of DOCUMENTATION_FILES) {
    await mkdir(dirname(resolve(destination, file)), { recursive: true });
    await copyFile(resolve(source, file), resolve(destination, file));
  }
  await checkDocumentationLinks(destination);
}
