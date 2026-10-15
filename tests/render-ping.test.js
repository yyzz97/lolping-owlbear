import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPingLabel } from '../src/render-ping.js';

const image = { width: 400, height: 256, mime: 'image/png', url: 'https://example.test/ping.png' };

test('ping text fits the host URL limit and shares the PNG pixel frame', () => {
  const result = renderPingLabel(image, '敌人消失 · Alice');
  assert.match(result.url, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(result.url.split(',')[1], 'base64').toString('utf8');
  assert.equal(result.width, image.width);
  assert.equal(result.height, image.height);
  assert.equal(result.mime, 'image/svg+xml');
  assert.ok(result.url.length <= 2048);
  assert.match(svg, /x="200" y="204"/);
  assert.match(svg, /width="400" height="256"/);
  assert.match(svg, /敌人消失 · Alice/);
  assert.doesNotMatch(svg, /<rect|<image/);
});

test('long Unicode names and XML characters cannot overflow the URL or inject SVG', () => {
  for (const name of ['🧙'.repeat(200), '测试玩家'.repeat(100), '<>&"\''.repeat(100)]) {
    const result = renderPingLabel(image, `注意 · ${name}`);
    const svg = Buffer.from(result.url.split(',')[1], 'base64').toString('utf8');
    assert.ok(result.url.length <= 2048);
    assert.equal((svg.match(/<text/g) ?? []).length, 1);
    assert.match(svg, /lengthAdjust="spacingAndGlyphs"/);
    assert.doesNotMatch(svg, /<>&/);
  }
});
