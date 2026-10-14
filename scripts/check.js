import { access, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = path.join(root, 'src');
for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(sourceDir, entry.name)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const manifest = JSON.parse(await readFile(path.join(root, 'public/manifest.json'), 'utf8'));
for (const field of ['icon', 'background_url']) {
  const resource = manifest[field];
  if (typeof resource !== 'string' || !resource.startsWith('/')) throw new Error(`Invalid local manifest resource: ${field}`);
  const resourcePath = field === 'icon'
    ? path.join(root, 'public', resource.slice(1))
    : path.join(root, resource.slice(1));
  await access(resourcePath);
}

console.log('Owlbear source and manifest resources are valid.');
