import { fileURLToPath } from 'node:url';
import { collectPublicFiles, validatePublicFiles, publicGitCandidates } from './public-files.mjs';
import { checkDocumentationLinks } from './package-docs.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = await collectPublicFiles(root);
await validatePublicFiles(root, await publicGitCandidates(root), allowed);
await validatePublicFiles(root, allowed, allowed);
await checkDocumentationLinks(root);
console.log('Public repository check passed: allowlisted files, sensitive-material checks, and documentation links.');
