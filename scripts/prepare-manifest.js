import { readFile, writeFile } from 'node:fs/promises';

const manifestUrl = new URL('../dist/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const hostedBase = 'https://yyzz97.github.io/lolping-owlbear/';

manifest.icon = new URL('wheel.svg', hostedBase).href;
manifest.background_url = new URL('index.html', hostedBase).href;

await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
