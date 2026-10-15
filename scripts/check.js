import { access, readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { uiAssetsFor } from '../src/ui-assets.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = path.join(root, 'src');
for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(sourceDir, entry.name)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const manifest = JSON.parse(await readFile(path.join(root, 'public/manifest.json'), 'utf8'));
const assetFiles = [
  'Retreat_ping.png', 'Push_ping.png', 'On_My_Way_ping.png', 'All_In_ping.png',
  'Assist_Me_ping.png', 'Need_Vision_ping.png', 'Enemy_Missing_ping.png', 'Enemy_Vision_ping.png', 'Caution_ping.png',
  'Retreat_ping_SFX.ogg', 'Push_ping_SFX.ogg', 'On_My_Way_ping_SFX.ogg', 'All_In_ping_SFX.ogg',
  'Assist_Me_ping_SFX.ogg', 'Need_Vision_ping_SFX.ogg', 'Enemy_Missing_ping_SFX.ogg', 'Enemy_Vision_ping_SFX.ogg', 'Caution_ping_SFX.ogg',
];
for (const asset of assetFiles) await access(path.join(root, 'public/assets', asset));
const uiAssets = uiAssetsFor(new URL('../public/', import.meta.url));
for (const image of [
  uiAssets.wheelBase, uiAssets.wheelSelectionNone,
  ...Object.values(uiAssets.wheels), ...Object.values(uiAssets.wheelSelections),
  ...Object.values(uiAssets.wheelCenters), ...Object.values(uiAssets.pings),
]) {
  await access(fileURLToPath(image.url));
}
for (const field of ['icon', 'background_url']) {
  const resource = manifest[field];
  if (typeof resource !== 'string' || !resource.startsWith('/')) throw new Error(`Invalid local manifest resource: ${field}`);
  const resourcePath = field === 'icon'
    ? path.join(root, 'public', resource.slice(1))
    : path.join(root, resource.slice(1));
  await access(resourcePath);
}

console.log('Owlbear source and manifest resources are valid.');
