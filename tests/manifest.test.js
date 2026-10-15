import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest identifies the Owlbear extension and local resource paths', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));

  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.homepage_url, 'https://github.com/yyzz97/lolping-owlbear');
  assert.match(manifest.name, /Owlbear Rodeo/);
  assert.equal(manifest.author, 'yyzz97');
  assert.equal(manifest.version, '1.0.7');
  assert.equal(manifest.background_url, '/index.html');
  assert.equal(manifest.icon, '/wheel.svg');
});
