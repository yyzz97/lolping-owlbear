import test from 'node:test';
import assert from 'node:assert/strict';
import { registerExtension, CHANNEL, DISPLAY_MS, EXTENSION_ID } from '../src/extension.js';
import { WHEEL } from '../src/geometry.js';

const TEST_WHEEL_ICON = 'https://static.example.test/wheel.svg';
const TEST_SIGNAL_ASSETS = Object.fromEntries([
  ['retreat', { width: 256, height: 256, imageUrl: 'https://static.example.test/Retreat_ping.png' }],
  ['bait', { width: 128, height: 128, imageUrl: 'https://static.example.test/Bait_ping.png' }],
  ['omw', { width: 256, height: 256, imageUrl: 'https://static.example.test/On_My_Way_ping.png' }],
  ['allin', { width: 256, height: 256, imageUrl: 'https://static.example.test/All_In_ping.png' }],
  ['assist', { width: 256, height: 256, imageUrl: 'https://static.example.test/Assist_Me_ping.png' }],
  ['hold', { width: 256, height: 256, imageUrl: 'https://static.example.test/Hold_ping.png' }],
  ['missing', { width: 256, height: 256, imageUrl: 'https://static.example.test/Enemy_Missing_ping.png' }],
  ['push', { width: 256, height: 256, imageUrl: 'https://static.example.test/Push_ping.png' }],
  ['caution', { width: 256, height: 256, imageUrl: 'https://static.example.test/Caution_ping.png' }],
]);

function builder(type) {
  return () => {
    const item = { id: crypto.randomUUID(), type, style: {}, textStyle: {} };
    const styleFields = new Set([
      'fillColor', 'fillOpacity', 'strokeColor', 'strokeOpacity', 'strokeWidth',
      'backgroundOpacity', 'backgroundColor', 'cornerRadius',
      'fontFamily', 'fontSize', 'fontWeight',
    ]);
    const proxy = new Proxy({}, {
      get(_target, method) {
        if (method === 'build') return () => structuredClone({
          ...item,
          ...(type === 'LABEL' ? { text: { plainText: item.plainText ?? '', richText: [], style: structuredClone(item.textStyle), type: 'PLAIN' } } : {}),
        });
        return (...args) => {
          const key = String(method);
          if (key === 'plainText') item.plainText = args[0];
          else if (styleFields.has(key) && type === 'LABEL' && ['fontFamily', 'fontSize', 'fontWeight', 'fillColor', 'fillOpacity', 'strokeColor', 'strokeOpacity', 'strokeWidth'].includes(key)) item.textStyle[key] = args[0];
          else if (styleFields.has(key)) item.style[key] = args[0];
          else item[key] = args[0];
          return proxy;
        };
      },
    });
    return proxy;
  };
}

function billboardBuilder() {
  return ({ width, height, mime, url }, grid) => {
    const item = { id: crypto.randomUUID(), type: 'BILLBOARD', image: { width, height, mime, url }, grid };
    const proxy = new Proxy({}, {
      get(_target, method) {
        if (method === 'build') return () => structuredClone(item);
        return (...args) => {
          if (method === 'id') item.id = args[0];
          else if (method === 'position') item.position = args[0];
          else if (method === 'scale') item.scale = args[0];
          else item[method] = args[0];
          return proxy;
        };
      },
    });
    return proxy;
  };
}

function makeOwlbear(scale = 2, {
  metadataWritable = true,
  toolCreateError = null,
  modeCreateError = null,
} = {}) {
  let onReady;
  let metadata = {};
  let messageHandler;
  let sceneReadyHandler;
  let metadataHandler;
  const items = new Map();
  const messages = [];
  const removed = [];
  const modes = new Map();
  const registeredTools = new Map();
  const listeners = [];
  const notifications = [];
  const obr = {
    player: { id: 'alice', getName: async () => 'Alice', getConnectionId: async () => 'alice-connection' },
    room: { id: 'room-1' },
    onReady(callback) { onReady = callback; return () => {}; },
    tool: {
      async create(tool) {
        if (toolCreateError) throw toolCreateError;
        registeredTools.set(tool.id, tool);
      },
      async createMode(mode) {
        if (modeCreateError) throw modeCreateError;
        modes.set(mode.id, mode);
      },
      async remove(id) { registeredTools.delete(id); },
      async removeMode(id) { modes.delete(id); },
    },
    notification: {
      async show(message, variant) { notifications.push({ message, variant }); },
    },
    viewport: { async getScale() { return scale; } },
    party: {
      async getPlayers() { return [{ connectionId: 'bob-connection', name: 'Bob' }]; },
      onChange(callback) { listeners.push(callback); return () => {}; },
    },
    broadcast: {
      onMessage(_channel, callback) { messageHandler = callback; return () => { messageHandler = null; }; },
      async sendMessage(channel, data, options) { messages.push({ channel, data, options }); },
    },
    scene: {
      async isReady() { return true; },
      async getMetadata() { return structuredClone(metadata); },
      async setMetadata(update) {
        if (!metadataWritable) throw new Error('metadata is read-only');
        metadata = { ...metadata, ...structuredClone(update) };
        metadataHandler?.(metadata);
      },
      onMetadataChange(callback) { metadataHandler = callback; return () => { metadataHandler = null; }; },
      onReadyChange(callback) { sceneReadyHandler = callback; return () => { sceneReadyHandler = null; }; },
      items: { async getItems() { return [{ id: 'map-1', layer: 'MAP' }]; } },
      local: {
        async addItems(values) { for (const item of values) items.set(item.id, structuredClone(item)); },
        async updateItems(filter, update) {
          const selected = (Array.isArray(filter) ? filter : [...items.values()].filter(filter))
            .map(value => typeof value === 'string' ? items.get(value) : items.get(value.id))
            .filter(Boolean);
          update(selected);
        },
        async deleteItems(ids) {
          removed.push(...ids);
          for (const id of ids) items.delete(id);
        },
      },
    },
  };
  return {
    obr, items, messages, removed, modes, registeredTools, listeners, notifications,
    get onReady() { return onReady; },
    get messageHandler() { return messageHandler; },
    get sceneReadyHandler() { return sceneReadyHandler; },
    get metadata() { return metadata; },
  };
}

const flush = async () => {
  for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve));
};
const event = (x, y) => ({ pointerPosition: { x, y } });

async function setup(t, scale, withAssets = false) {
  const fake = makeOwlbear(scale);
  const cleanup = registerExtension(fake.obr, {
    buildPath: builder('PATH'), buildLabel: builder('LABEL'), wheelIcon: TEST_WHEEL_ICON,
    ...(withAssets ? { buildBillboard: billboardBuilder(), signalAssets: TEST_SIGNAL_ASSETS } : {}),
  });
  t.after(cleanup);
  await fake.onReady();
  await flush();
  assert.ok(fake.metadata[EXTENSION_ID].sceneKey);
  return fake;
}

test('registers the toolbar and mode with the hosted wheel icon URL', async t => {
  const fake = await setup(t);
  const tool = fake.registeredTools.values().next().value;
  const mode = fake.modes.values().next().value;
  assert.equal(tool.icons[0].icon, TEST_WHEEL_ICON);
  assert.equal(mode.icons[0].icon, TEST_WHEEL_ICON);
  assert.ok(fake.notifications.some(({ message, variant }) => message.includes('已加载') && variant === 'SUCCESS'));
});

test('reports toolbar registration failures instead of silently leaving the tool absent', async t => {
  const fake = makeOwlbear(2, { toolCreateError: new Error('tool registration rejected') });
  const cleanup = registerExtension(fake.obr, {
    buildPath: builder('PATH'), buildLabel: builder('LABEL'), wheelIcon: TEST_WHEEL_ICON,
  });
  t.after(cleanup);

  await assert.doesNotReject(fake.onReady());
  assert.equal(fake.registeredTools.size, 0);
  assert.equal(fake.modes.size, 0);
  assert.ok(fake.notifications.some(({ message, variant }) => message.includes('工具栏注册失败') && variant === 'ERROR'));
});

test('removes the tool and reports an error when mode registration fails', async t => {
  const fake = makeOwlbear(2, { modeCreateError: new Error('mode registration rejected') });
  const cleanup = registerExtension(fake.obr, {
    buildPath: builder('PATH'), buildLabel: builder('LABEL'), wheelIcon: TEST_WHEEL_ICON,
  });
  t.after(cleanup);

  await assert.doesNotReject(fake.onReady());
  assert.equal(fake.registeredTools.size, 0);
  assert.equal(fake.modes.size, 0);
  assert.ok(fake.notifications.some(({ message, variant }) => message.includes('轮盘模式注册失败') && variant === 'ERROR'));
});

test('dragging from the scene point selects and broadcasts a scene-anchored signal', async t => {
  const fake = await setup(t);
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(120, 240));
  await flush();
  assert.equal([...fake.items.values()].filter(item => item.id.includes('/wheel/')).length, 8);
  assert.equal([...fake.items.values()].filter(item => item.id.includes('/wheel-glyph/')).length, 8);
  mode.onToolMove({}, event(300, 240));
  await flush();
  const highlighted = [...fake.items.values()].filter(item => item.id.includes('/wheel/') && item.style.fillOpacity === 0.2);
  assert.equal(highlighted.length, 1);
  const centerLabel = [...fake.items.values()].find(item => item.id.includes('/center-label/'));
  assert.equal(centerLabel.text.plainText, 'ON MY WAY');
  const centerGlyph = [...fake.items.values()].find(item => item.id.includes('/center-glyph/'));
  assert.equal(centerGlyph.style.strokeColor, '#22b9e9');
  mode.onToolMove({}, event(120, 60));
  await flush();
  assert.equal(centerLabel.text.plainText, 'RETREAT');
  assert.equal(centerGlyph.style.strokeColor, '#f12c55');
  mode.onToolMove({}, event(120, 240));
  await flush();
  assert.equal(centerLabel.text.plainText, 'CAUTION');
  mode.onToolUp({}, event(300, 240));
  await flush();
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0].channel, CHANNEL);
  assert.deepEqual(fake.messages[0].options, { destination: 'REMOTE' });
  assert.deepEqual(
    { signalId: fake.messages[0].data.signalId, x: fake.messages[0].data.x, y: fake.messages[0].data.y },
    { signalId: 'omw', x: 120, y: 240 },
  );
  const marker = [...fake.items.values()].find(item => item.type === 'LABEL');
  assert.match(marker.text.plainText, /正在路上/);
  assert.match(marker.text.plainText, /Alice/);
  assert.equal(fake.items.size, 3, 'wheel is removed and the temporary local ping remains');
  assert.equal([...fake.items.values()].filter(item => item.id.includes('/ping-glyph/')).length, 1);
});

test('center release and Escape cancel without broadcasting', async t => {
  const fake = await setup(t);
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(10, 10));
  await flush();
  mode.onToolUp({}, event(10, 10));
  await flush();
  assert.equal(fake.messages.length, 0);
  assert.equal(fake.items.size, 0);

  mode.onToolDown({}, event(20, 20));
  await flush();
  mode.onKeyDown({}, { key: 'Escape' });
  await flush();
  assert.equal(fake.messages.length, 0);
  assert.equal(fake.items.size, 0);
});

test('remote messages render only in the matching scene and overlapping pings coexist', async t => {
  const fake = await setup(t);
  const key = fake.metadata[EXTENSION_ID].sceneKey;
  const message = {
    v: 1, type: 'ping', eventId: 'remote-1', userId: 'bob', sceneKey: key,
    signalId: 'danger', x: -80, y: 900,
  };
  fake.messageHandler({ data: { ...message, sceneKey: 'another-scene' }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(fake.items.size, 0);

  fake.messageHandler({ data: message, connectionId: 'bob-connection' });
  fake.messageHandler({ data: { ...message, eventId: 'remote-2', signalId: 'bait' }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(fake.items.size, 6);
  const labels = [...fake.items.values()].filter(item => item.type === 'LABEL');
  assert.equal(labels.length, 2);
  assert.ok(labels.every(item => item.text.plainText.includes('Bob')));
});

test('invalid and unknown-sender payloads do not create scene markers', async t => {
  const fake = await setup(t);
  const key = fake.metadata[EXTENSION_ID].sceneKey;
  fake.messageHandler({
    data: { v: 1, type: 'ping', eventId: 'bad', userId: 'bob', sceneKey: key, signalId: 'nope', x: 4, y: 5 },
    connectionId: 'bob-connection',
  });
  fake.messageHandler({
    data: { v: 1, type: 'ping', eventId: 'bad2', userId: 'bob', sceneKey: key, signalId: 'danger', x: Infinity, y: 5 },
    connectionId: 'bob-connection',
  });
  await flush();
  assert.equal(fake.items.size, 0);
});

test('temporary pings are scheduled for the selected duration', async t => {
  const fake = await setup(t);
  fake.messageHandler({
    data: {
      v: 1, type: 'ping', eventId: 'remote-3', userId: 'bob',
      sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'danger', x: 0, y: 0,
    },
    connectionId: 'bob-connection',
  });
  await flush();
  assert.equal(DISPLAY_MS, 3000);
  assert.equal(fake.items.size, 3);
});

test('players still share scene identity when scene metadata is read-only', async t => {
  const alice = makeOwlbear(1, { metadataWritable: false });
  const bob = makeOwlbear(1, { metadataWritable: false });
  t.after(() => { alice.cleanup?.(); bob.cleanup?.(); });

  alice.cleanup = registerExtension(alice.obr, {
    buildPath: builder('PATH'), buildLabel: builder('LABEL'), wheelIcon: TEST_WHEEL_ICON,
  });
  bob.cleanup = registerExtension(bob.obr, {
    buildPath: builder('PATH'), buildLabel: builder('LABEL'), wheelIcon: TEST_WHEEL_ICON,
  });
  await Promise.all([alice.onReady(), bob.onReady()]);
  await flush();

  const mode = alice.modes.values().next().value;
  mode.onToolDown({}, event(20, 30));
  await flush();
  mode.onToolUp({}, event(200, 30));
  await flush();
  assert.equal(alice.messages.length, 1);

  bob.messageHandler({ data: alice.messages[0].data, connectionId: 'alice-connection' });
  await flush();
  const marker = [...bob.items.values()].find(item => item.id.includes('/ping/'));
  assert.ok(marker);
  assert.match(marker.text.plainText, /正在路上/);
});

test('wheel geometry and icons compensate zoom while labels retain their native text size', async t => {
  for (const scale of [0.05, 0.15, 0.5, 2]) {
    const fake = await setup(t, scale, true);
    const key = fake.metadata[EXTENSION_ID].sceneKey;
    fake.messageHandler({
      data: { v: 1, type: 'ping', eventId: `zoom-${String(scale).replace('.', '-')}`, userId: 'bob', sceneKey: key, signalId: 'danger', x: 0, y: 0 },
      connectionId: 'bob-connection',
    });
    await flush();

    const pingLabel = [...fake.items.values()].find(item => item.id.includes('/ping/'));
    const ring = [...fake.items.values()].find(item => item.id.includes('/ring/'));
    const pingIcon = [...fake.items.values()].find(item => item.id.includes('/ping-glyph/'));
    assert.deepEqual(pingLabel.scale, { x: 1, y: 1 });
    assert.equal(pingLabel.text.style.fontSize, 13);
    assert.equal(ring.scale.x * scale, 1);
    assert.equal(ring.scale.y * scale, 1);
    assert.equal(pingIcon.scale.x * pingIcon.image.width / pingIcon.grid.dpi * 96, 48);
    assert.equal((pingLabel.position.y - 52 / scale) * scale, 0);

    const mode = fake.modes.values().next().value;
    mode.onToolDown({}, event(0, 0));
    await flush();
    const wheelIcons = [...fake.items.values()].filter(item => item.id.includes('/wheel-glyph/'));
    assert.equal(wheelIcons.length, 8);
    for (const item of wheelIcons) assert.equal(item.scale.x * item.image.width / item.grid.dpi * 96, WHEEL.iconSize);
    const center = [...fake.items.values()].find(item => item.id.includes('/center-label/'));
    const back = [...fake.items.values()].find(item => item.id.includes('/back/'));
    assert.deepEqual(center.scale, { x: 1, y: 1 });
    assert.deepEqual(back.scale, { x: 1, y: 1 });
    assert.equal(center.text.style.fontSize, 19);
    assert.equal(back.text.style.fontSize, 14);
    assert.equal(WHEEL.innerRadius, 102);
    assert.equal(WHEEL.outerRadius, 170);
  }
});

test('the same screen-space drag selects the same direction at zoomed and reduced scales', async t => {
  for (const scale of [0.5, 2]) {
    const fake = await setup(t, scale);
    const mode = fake.modes.values().next().value;
    mode.onToolDown({}, event(400, 300));
    await flush();
    const screenDrag = 120;
    const release = event(400 + screenDrag / scale, 300);
    mode.onToolMove({}, release);
    await flush();
    mode.onToolUp({}, release);
    await flush();
    assert.equal(fake.messages.length, 1);
    assert.equal(fake.messages[0].data.signalId, 'omw');
  }
});

test('uses supplied PNG assets for the wheel, selected center, and map marker', async t => {
  const fake = makeOwlbear(2);
  const signalAssets = TEST_SIGNAL_ASSETS;
  const cleanup = registerExtension(fake.obr, {
    buildBillboard: billboardBuilder(), buildPath: builder('PATH'), buildLabel: builder('LABEL'), signalAssets, wheelIcon: TEST_WHEEL_ICON,
  });
  t.after(cleanup);
  await fake.onReady();
  await flush();
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(100, 100));
  await flush();
  const wheelImages = [...fake.items.values()].filter(item => item.type === 'BILLBOARD');
  assert.equal(wheelImages.length, 9);
  assert.ok(wheelImages.every(item => item.image.url.endsWith('.png')));
  assert.ok(wheelImages.every(item => item.grid.dpi === item.image.width));
  assert.ok(wheelImages.every(item => item.grid.offset.x === item.image.width / 2 && item.grid.offset.y === item.image.height / 2));
  assert.ok(wheelImages.slice(0, 8).every(item => item.scale.x * item.image.width / item.grid.dpi * 96 === WHEEL.iconSize));
  mode.onToolMove({}, event(100, 400));
  await flush();
  const center = [...fake.items.values()].find(item => item.id.includes('/center-glyph/'));
  assert.equal(center.image.url, signalAssets.assist.imageUrl);
  assert.equal(center.scale.x * center.image.width / center.grid.dpi * 96, 36);
  mode.onToolUp({}, event(100, 400));
  await flush();
  const marker = [...fake.items.values()].find(item => item.id.includes('/ping-glyph/'));
  assert.equal(marker.image.url, signalAssets.assist.imageUrl);
});
