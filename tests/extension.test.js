import test from 'node:test';
import assert from 'node:assert/strict';
import { registerExtension, CHANNEL, DISPLAY_MS, EXTENSION_ID } from '../src/extension.js';
import { uiAssetsFor } from '../src/ui-assets.js';

const TEST_WHEEL_ICON = 'https://static.example.test/wheel.svg';
const TEST_UI_ASSETS = uiAssetsFor('https://static.example.test/');
const TEST_SIGNAL_ASSETS = { caution: { audioUrl: 'https://static.example.test/Caution_ping_SFX.ogg' } };

function billboardBuilder() {
  return ({ width, height, mime, url }, grid) => {
    const item = { id: crypto.randomUUID(), type: 'BILLBOARD', image: { width, height, mime, url }, grid, style: {} };
    const proxy = new Proxy({}, {
      get(_target, method) {
        if (method === 'build') return () => structuredClone(item);
        return (...args) => {
          if (method === 'id') item.id = args[0];
          else if (method === 'position') item.position = args[0];
          else if (method === 'scale') item.scale = args[0];
          else if (method === 'minViewScale' || method === 'maxViewScale') item.style[method] = args[0];
          else item[method] = args[0];
          return proxy;
        };
      },
    });
    return proxy;
  };
}

function labelBuilder() {
  return () => {
    const item = { type: 'LABEL', text: { style: {} }, style: {} };
    const textFields = ['plainText', 'width', 'height'];
    const textStyles = ['padding', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'textAlignVertical', 'fillColor', 'strokeColor', 'strokeWidth', 'lineHeight'];
    const labelStyles = ['backgroundOpacity', 'pointerDirection', 'pointerHeight', 'pointerWidth'];
    const proxy = new Proxy({}, { get(_target, method) {
      if (method === 'build') return () => structuredClone(item);
      return value => {
        if (textFields.includes(method)) item.text[method] = value;
        else if (textStyles.includes(method)) item.text.style[method] = value;
        else if (labelStyles.includes(method)) item.style[method] = value;
        else item[method] = value;
        return proxy;
      };
    } });
    return proxy;
  };
}

function makeOwlbear(scale = 2, {
  metadataWritable = true,
  toolCreateError = null,
  modeCreateError = null,
  dpi = 150,
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
    viewport: { async getScale() { return scale; }, async setScale(value) { scale = value; } },
    party: {
      async getPlayers() { return [{ connectionId: 'bob-connection', name: 'Bob' }]; },
      onChange(callback) { listeners.push(callback); return () => {}; },
    },
    broadcast: {
      onMessage(_channel, callback) { messageHandler = callback; return () => { messageHandler = null; }; },
      async sendMessage(channel, data, options) { messages.push({ channel, data, options }); },
    },
    scene: {
      grid: { async getDpi() { return dpi; } },
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
        async addItems(values) {
          for (const item of values) {
            if (item.image?.url.length > 2048) throw new Error('image.url exceeds Owlbear limit');
            items.set(item.id, structuredClone(item));
          }
        },
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

const options = () => ({
  buildBillboard: billboardBuilder(), wheelIcon: TEST_WHEEL_ICON,
  signalAssets: TEST_SIGNAL_ASSETS, uiAssets: TEST_UI_ASSETS,
  buildLabel: labelBuilder(), version: 'test',
});

async function setup(t, scale = 2, settings = {}) {
  const fake = makeOwlbear(scale, settings);
  const cleanup = registerExtension(fake.obr, options());
  t.after(cleanup);
  await fake.onReady();
  await flush();
  if (settings.metadataWritable !== false) assert.ok(fake.metadata[EXTENSION_ID].sceneKey);
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
  const cleanup = registerExtension(fake.obr, options());
  t.after(cleanup);

  await assert.doesNotReject(fake.onReady());
  assert.equal(fake.registeredTools.size, 0);
  assert.equal(fake.modes.size, 0);
  assert.ok(fake.notifications.some(({ message, variant }) => message.includes('工具栏注册失败') && variant === 'ERROR'));
});

test('removes the tool and reports an error when mode registration fails', async t => {
  const fake = makeOwlbear(2, { modeCreateError: new Error('mode registration rejected') });
  const cleanup = registerExtension(fake.obr, options());
  t.after(cleanup);

  await assert.doesNotReject(fake.onReady());
  assert.equal(fake.registeredTools.size, 0);
  assert.equal(fake.modes.size, 0);
  assert.ok(fake.notifications.some(({ message, variant }) => message.includes('轮盘模式注册失败') && variant === 'ERROR'));
});

test('dragging updates overlay images without replacing the static wheel', async t => {
  const fake = await setup(t);
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(120, 240));
  await flush();
  assert.equal(fake.items.size, 3);
  const wheel = [...fake.items.values()].find(item => item.id.includes('/wheel-base/'));
  const selection = [...fake.items.values()].find(item => item.id.includes('/wheel-selection/'));
  const center = [...fake.items.values()].find(item => item.id.includes('/wheel-center/'));
  assert.equal(wheel.image.url, TEST_UI_ASSETS.wheelBase.url);
  assert.equal(selection.image.url, TEST_UI_ASSETS.wheelSelectionNone.url);
  assert.equal(center.image.url, TEST_UI_ASSETS.wheelCenters.caution.url);
  mode.onToolMove({}, event(300, 240));
  await flush();
  assert.equal(selection.name, 'ON MY WAY');
  assert.equal(selection.image.url, TEST_UI_ASSETS.wheelSelections.omw.url);
  assert.equal(center.image.url, TEST_UI_ASSETS.wheelCenters.omw.url);
  mode.onToolMove({}, event(120, 60));
  await flush();
  assert.equal(selection.name, 'RETREAT');
  assert.equal(center.image.url, TEST_UI_ASSETS.wheelCenters.retreat.url);
  mode.onToolMove({}, event(120, 240));
  await flush();
  assert.equal(selection.name, 'CAUTION');
  assert.equal(center.image.url, TEST_UI_ASSETS.wheelCenters.caution.url);
  mode.onToolUp({}, event(300, 240));
  await flush();
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0].channel, CHANNEL);
  assert.deepEqual(fake.messages[0].options, { destination: 'REMOTE' });
  assert.deepEqual(
    { signalId: fake.messages[0].data.signalId, x: fake.messages[0].data.x, y: fake.messages[0].data.y },
    { signalId: 'omw', x: 120, y: 240 },
  );
  assert.equal(fake.items.size, 2, 'wheel is removed and the hosted icon plus native label remain');
  const marker = [...fake.items.values()][0];
  assert.equal(marker.name, '正在路上 · Alice');
  assert.equal(marker.image.url, TEST_UI_ASSETS.pings.omw.url);
  const label = [...fake.items.values()][1];
  assert.equal(label.type, 'LABEL');
  assert.equal(label.text.plainText, '正在路上 · Alice');
  assert.equal(label.style.backgroundOpacity, 0);
  assert.equal(label.image, undefined);
});

test('center release sends caution with its audio and Escape cancels', async t => {
  const played = [];
  const previousAudio = globalThis.Audio;
  globalThis.Audio = class {
    constructor(url) { this.url = url; }
    play() { played.push(this.url); return Promise.resolve(); }
  };
  t.after(() => {
    if (previousAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = previousAudio;
  });
  const fake = await setup(t);
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(10, 10));
  await flush();
  mode.onToolUp({}, event(10, 10));
  await flush();
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0].data.signalId, 'caution');
  assert.deepEqual(played, [TEST_SIGNAL_ASSETS.caution.audioUrl]);
  assert.equal([...fake.items.values()][0].name, '注意 · Alice');
  mode.onToolDown({}, event(20, 20));
  await flush();
  mode.onKeyDown({}, { key: 'Escape' });
  await flush();
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.items.size, 2);
  assert.equal(played.length, 1);
});

test('returning to the center sends caution and remote clients preserve the scene anchor', async t => {
  const sender = await setup(t, 0.01);
  const receiver = await setup(t, 32);
  const mode = sender.modes.values().next().value;
  mode.onToolDown({}, event(400, 300));
  await flush();
  mode.onToolMove({}, event(15400, 300));
  await flush();
  mode.onToolUp({}, event(400, 300));
  await flush();
  assert.equal(sender.messages.length, 1);
  const message = sender.messages[0].data;
  assert.equal(message.signalId, 'caution');
  receiver.messageHandler({ data: message, connectionId: 'bob-connection' });
  await flush();
  assert.equal(receiver.items.size, 2);
  const marker = [...receiver.items.values()][0];
  assert.equal(marker.name, '注意 · Bob');
  assert.deepEqual(marker.position, { x: 400, y: 300 });
});

test('a quick center release waits for the initial image instead of leaving an open wheel', async t => {
  const fake = await setup(t);
  let resolveDpi;
  fake.obr.scene.grid.getDpi = () => new Promise(resolve => { resolveDpi = resolve; });
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(100, 100));
  mode.onToolUp({}, event(100, 100));
  resolveDpi(150);
  await flush();
  // Ping rendering makes a second DPI request after the wheel has closed.
  resolveDpi(150);
  await flush();
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0].data.signalId, 'caution');
  assert.equal(fake.items.size, 2);
  assert.ok([...fake.items.values()][0].id.includes('/ping/'));
});

test('all wheel states share a single image size, including bait and the full missing label', async t => {
  const fake = await setup(t, 1);
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(200, 200));
  await flush();
  const wheel = [...fake.items.values()][0];
  const selection = [...fake.items.values()].find(item => item.id.includes('/wheel-selection/'));
  const center = [...fake.items.values()].find(item => item.id.includes('/wheel-center/'));
  for (const [index, id] of ['retreat', 'bait', 'omw', 'allin', 'assist', 'hold', 'missing', 'push'].entries()) {
    const angle = (-90 + index * 45) * Math.PI / 180;
    mode.onToolMove({}, event(200 + 130 * Math.cos(angle), 200 + 130 * Math.sin(angle)));
    await flush();
    assert.equal(selection.image.url, TEST_UI_ASSETS.wheelSelections[id].url);
    assert.equal(center.image.url, TEST_UI_ASSETS.wheelCenters[id].url);
    assert.equal(fake.items.size, 3, 'static wheel and two overlays remain mounted');
      assert.equal(wheel.image.width, 728);
    assert.deepEqual(wheel.grid.offset, { x: 364, y: 364 });
  }
  mode.onToolMove({}, event(70, 200));
  await flush();
  assert.equal([...fake.items.values()].find(item => item.id.includes('/wheel-selection/')).name, 'ENEMY MISSING');
});

test('remote scene isolation and overlapping pings remain independent', async t => {
  const fake = await setup(t);
  const message = { v: 1, type: 'ping', eventId: 'remote-1', userId: 'bob',
    sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'danger', x: -80, y: 900 };
  fake.messageHandler({ data: { ...message, sceneKey: 'another-scene' }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(fake.items.size, 0);
  for (const [index, id] of ['danger', 'bait', 'caution'].entries()) {
    fake.messageHandler({ data: { ...message, eventId: `remote-${index}`, signalId: id }, connectionId: 'bob-connection' });
  }
  await flush();
  assert.equal(fake.items.size, 6);
  assert.ok([...fake.items.values()].every(item => item.name.includes('Bob')));
  fake.sceneReadyHandler(false);
  await flush();
  assert.equal(fake.items.size, 0);
});

test('invalid payloads do not create markers', async t => {
  const fake = await setup(t);
  const message = { v: 1, type: 'ping', eventId: 'bad', userId: 'bob',
    sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'nope', x: 4, y: 5 };
  fake.messageHandler({ data: message, connectionId: 'bob-connection' });
  fake.messageHandler({ data: { ...message, signalId: 'danger', x: Infinity }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(fake.items.size, 0);
});

test('temporary pings expire after three seconds', async t => {
  const fake = await setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  fake.messageHandler({ data: { v: 1, type: 'ping', eventId: 'expiry', userId: 'bob',
    sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'missing', x: 0, y: 0 }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(DISPLAY_MS, 3000);
  assert.equal(fake.items.size, 2);
  t.mock.timers.tick(DISPLAY_MS);
  await flush();
  assert.equal(fake.items.size, 0);
});

test('a rejected ping image reports a rendering error instead of failing silently', async t => {
  const fake = await setup(t);
  fake.obr.scene.local.addItems = async () => { throw new Error('image rejected'); };
  fake.messageHandler({ data: { v: 1, type: 'ping', eventId: 'rejected-image', userId: 'bob',
    sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'missing', x: 0, y: 0 }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(fake.items.size, 0);
  assert.ok(fake.notifications.some(({ message, variant }) => message.includes('信号图标绘制失败：image rejected') && variant === 'ERROR'));
});

test('a rejected label keeps the hosted icon visible and cleans it up on time', async t => {
  const fake = await setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const addItems = fake.obr.scene.local.addItems;
  fake.obr.scene.local.addItems = async items => {
    if (items.some(item => item.type === 'LABEL')) {
      const error = new Error('items do not match');
      error.details = [{ context: { message: '"items[0].image.url" must be a valid uri' } }];
      throw error;
    }
    return addItems(items);
  };
  fake.messageHandler({ data: { v: 1, type: 'ping', eventId: 'rejected-label', userId: 'bob',
    sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'missing', x: 120, y: 240 }, connectionId: 'bob-connection' });
  await flush();
  assert.equal(fake.items.size, 1);
  assert.equal([...fake.items.values()][0].image.url, TEST_UI_ASSETS.pings.missing.url);
  assert.ok(fake.notifications.some(({ message }) => message.includes('lolPing test 信号文字绘制失败："items[0].image.url" must be a valid uri')));
  t.mock.timers.tick(DISPLAY_MS);
  await flush();
  assert.equal(fake.items.size, 0);
});

test('players share scene identity when metadata is read-only', async t => {
  const alice = await setup(t, 1, { metadataWritable: false });
  const bob = await setup(t, 1, { metadataWritable: false });
  const mode = alice.modes.values().next().value;
  mode.onToolDown({}, event(20, 30));
  await flush();
  mode.onToolUp({}, event(200, 30));
  await flush();
  bob.messageHandler({ data: alice.messages[0].data, connectionId: 'alice-connection' });
  await flush();
  assert.equal([...bob.items.values()][0].name, '正在路上 · 房间玩家');
});

function projectedSize(item, dpi, zoom) {
  const viewScale = Math.min(item.style.maxViewScale ?? Infinity, Math.max(item.style.minViewScale ?? 0, 1 / zoom));
  return { width: item.image.width * item.scale.x * dpi / item.grid.dpi * zoom * viewScale,
    height: item.image.height * item.scale.y * dpi / item.grid.dpi * zoom * viewScale };
}

test('fixed billboards and native labels share scene anchors across zoom and grid DPI', async t => {
  for (const dpi of [96, 128, 150, 300]) {
    const fake = await setup(t, 1, { dpi });
    const mode = fake.modes.values().next().value;
    mode.onToolDown({}, event(400, 300));
    await flush();
    const wheel = [...fake.items.values()][0];
    fake.messageHandler({ data: { v: 1, type: 'ping', eventId: `zoom-${dpi}`, userId: 'bob',
      sceneKey: fake.metadata[EXTENSION_ID].sceneKey, signalId: 'missing', x: 900, y: 500 }, connectionId: 'bob-connection' });
    await flush();
    const ping = [...fake.items.values()].find(item => item.id.includes('/ping/'));
    for (const zoom of [0.01, 0.025, 0.05, 0.15, 0.5, 1, 2, 8, 32, 64]) {
      await fake.obr.viewport.setScale(zoom);
      assert.deepEqual(projectedSize(wheel, dpi, zoom), { width: 364, height: 364 });
      assert.deepEqual(projectedSize(ping, dpi, zoom), { width: 200, height: 128 });
      assert.deepEqual(ping.position, { x: 900, y: 500 });
      assert.deepEqual(ping.grid.offset, { x: 200, y: 100 });
      const label = [...fake.items.values()].find(item => item.type === 'LABEL');
      assert.deepEqual(label.position, ping.position);
      assert.equal(label.text.width, 200);
      assert.equal(label.text.height, 60);
      assert.equal(label.style.pointerDirection, 'UP');
      assert.equal(label.style.pointerHeight, 0);
      assert.equal(label.style.backgroundOpacity, 0);
      assert.equal(label.style.minViewScale, undefined);
      assert.equal(label.style.maxViewScale, undefined);
      const release = event(400 + 120 / zoom, 300);
      mode.onToolMove({}, release);
      await flush();
      assert.equal([...fake.items.values()].find(item => item.id.includes('/wheel-selection/')).name, 'ON MY WAY', 'selection uses the current scale while the wheel is already open');
      mode.onToolMove({}, event(400, 300));
      await flush();
    }
    mode.onToolUp({}, event(400, 300));
    await flush();
    assert.equal(fake.messages[0].data.signalId, 'caution');
  }
});

test('bursts of pointer events skip stale positions and release sends the latest direction', async t => {
  const fake = await setup(t, 1);
  const mode = fake.modes.values().next().value;
  mode.onToolDown({}, event(300, 300));
  await flush();
  let reads = 0;
  let releaseScale;
  fake.obr.viewport.getScale = () => {
    reads++;
    return reads === 1 ? new Promise(resolve => { releaseScale = resolve; }) : Promise.resolve(1);
  };
  mode.onToolMove({}, event(450, 300));
  await flush();
  for (let index = 0; index < 500; index++) mode.onToolMove({}, event(150, 300));
  mode.onToolUp({}, event(300, 150));
  releaseScale(1);
  await flush();
  assert.ok(reads <= 2, `processed ${reads} scale reads for one pointer burst`);
  assert.equal(fake.messages.length, 1);
  assert.equal(fake.messages[0].data.signalId, 'retreat');
  assert.ok([...fake.items.values()].every(item => !item.image || item.image.url.startsWith('https://')));
});
