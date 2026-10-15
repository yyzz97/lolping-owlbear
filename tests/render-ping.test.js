import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPingImage } from '../src/render-ping.js';

test('a ping bitmap includes its full sender label and keeps every component in one pixel frame', async t => {
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  const calls = [];
  globalThis.Image = class {
    set src(url) { this.url = url; queueMicrotask(() => this.onload()); }
  };
  const context = {
    drawImage(image, x, y) { calls.push({ type: 'image', url: image.url, x, y }); },
    fillText(text, x, y, maxWidth) { calls.push({ type: 'text', text, x, y, maxWidth }); },
  };
  const canvas = { getContext: () => context, toDataURL: mime => `data:${mime};base64,ping` };
  globalThis.document = { createElement: () => canvas };
  t.after(() => {
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const image = { width: 400, height: 256, mime: 'image/png', url: 'https://static.example.test/ping-missing.png' };
  const label = '敌人消失 · Alice';
  const result = await renderPingImage(image, label);
  assert.equal(canvas.width, 400);
  assert.equal(canvas.height, 256);
  assert.equal(result.url, 'data:image/png;base64,ping');
  assert.deepEqual(calls, [
    { type: 'image', url: image.url, x: 0, y: 0 },
    { type: 'text', text: label, x: 200, y: 204, maxWidth: 376 },
  ]);
  assert.equal(context.textAlign, 'center');
  assert.equal(context.textBaseline, 'middle');
  assert.ok(context.shadowBlur <= 3, 'a text shadow adds contrast without a background bar');
});
