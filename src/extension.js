import { DEFAULT_SIGNAL, SIGNALS, signalById } from './signals.js';
import { WHEEL, pickSlice } from './geometry.js';
import { createPing, parsePing } from './protocol.js';
import { playPing, unlockAudio } from './audio.js';

export const EXTENSION_ID = 'com.github.dmhpj.lolping-owlbear';
export const TOOL_ID = `${EXTENSION_ID}/tool`;
export const MODE_ID = `${TOOL_ID}/mode`;
export const CHANNEL = `${EXTENSION_ID}/pings`;
export const DISPLAY_MS = 3000;

const SCENE_METADATA_KEY = 'sceneKey';
const validSceneKey = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function reportStartupError(OBR, stage, error) {
  console.error(`[lolPing] ${stage} failed`, error);
  void OBR.notification.show(`lolPing ${stage}失败，工具栏可能不会显示。请刷新房间。`, 'ERROR').catch(() => {});
}

function reportRenderError(OBR, error, version, stage = '信号') {
  console.error('[lolPing] Rendering failed', error);
  const detail = error.details?.[0]?.context?.message ?? error.message ?? String(error);
  const reason = detail.match(/"items\[\d+\]\.(?:image|grid|style)[^"]*"[^.]+/)?.[0] ?? detail;
  void OBR.notification.show(`lolPing ${version} ${stage}绘制失败：${reason.slice(0, 220)}`, 'ERROR').catch(() => {});
}

async function sceneKeyFor(OBR) {
  const metadata = await OBR.scene.getMetadata();
  const saved = metadata[EXTENSION_ID]?.[SCENE_METADATA_KEY];
  if (validSceneKey(saved)) return saved;
  const sceneItems = await OBR.scene.items.getItems();
  const ids = sceneItems.map(item => item.id).sort();
  let hash = 2166136261;
  for (const character of `${OBR.room.id}|${ids.join('|')}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const sceneKey = `scene-${(hash >>> 0).toString(36)}`;
  try {
    await OBR.scene.setMetadata({ [EXTENSION_ID]: { [SCENE_METADATA_KEY]: sceneKey } });
    const latest = await OBR.scene.getMetadata();
    return validSceneKey(latest[EXTENSION_ID]?.[SCENE_METADATA_KEY])
      ? latest[EXTENSION_ID][SCENE_METADATA_KEY]
      : sceneKey;
  } catch {
    return sceneKey;
  }
}

function makeBillboard(buildBillboard, image, point, width, dpi, itemType, name, offset) {
  return buildBillboard(image, { offset: offset ?? { x: image.width / 2, y: image.height / 2 }, dpi })
    .id(`${EXTENSION_ID}/${itemType}/${crypto.randomUUID()}`)
    .name(name)
    .position(point)
    .scale({ x: width / image.width, y: width / image.width })
    .zIndex(Date.now())
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build();
}

export function registerExtension(OBR, { buildBillboard, signalAssets, wheelIcon, uiAssets, renderPingLabel, version = 'dev' }) {
  let sceneKey = null;
  let sceneGeneration = 0;
  let gesture = null;
  let localPings = new Map();
  let players = new Map();
  let ready = false;
  let closed = false;
  const unsubscribers = [];

  function deleteIds(ids) {
    if (ids.length) void OBR.scene.local.deleteItems(ids).catch(() => {});
  }

  function cancelWheel() {
    const current = gesture;
    gesture = null;
    if (current) deleteIds(current.itemIds);
  }

  function clearPings() {
    for (const entry of localPings.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      deleteIds(entry.ids);
    }
    localPings.clear();
  }

  async function showPing(message, sender) {
    const signal = signalById(message.signalId);
    if (!signal || !ready || message.sceneKey !== sceneKey) return false;
    const key = sceneKey;
    const label = `${signal.name} · ${sender}`;
    const dpi = await OBR.scene.grid.getDpi();
    if (!ready || key !== sceneKey) return false;
    const image = uiAssets.pings[signal.id];
    const items = [image, renderPingLabel(image, label)].map(content =>
      makeBillboard(buildBillboard, content, { x: message.x, y: message.y }, 200, dpi, 'ping', label,
        { x: image.width / 2, y: 100 }));
    const ids = items.map(item => item.id);
    const token = Symbol('ping');
    const entry = { ids, timer: null };
    localPings.set(token, entry);
    // A rejected text image must not prevent the hosted icon from appearing.
    void OBR.scene.local.addItems([items[0]]).then(() => {
      if (!localPings.has(token) || !ready || message.sceneKey !== sceneKey) {
        localPings.delete(token);
        deleteIds(ids);
        return;
      }
      entry.timer = setTimeout(() => {
        localPings.delete(token);
        deleteIds(ids);
      }, DISPLAY_MS);
      return OBR.scene.local.addItems([items[1]]).then(() => {
        if (!localPings.has(token)) deleteIds([items[1].id]);
      }).catch(error => reportRenderError(OBR, error, version, '信号文字'));
    }).catch(error => {
      localPings.delete(token);
      reportRenderError(OBR, error, version, '信号图标');
    });
    await unlockAudio();
    playPing(signal.id, signalAssets?.[signal.id]?.audioUrl);
    return true;
  }

  async function refreshParty() {
    try {
      const party = await OBR.party.getPlayers();
      players = new Map(party.map(player => [player.connectionId, player.name || '房间玩家']));
    } catch {
      players.clear();
    }
  }

  async function begin(event) {
    if (!ready || gesture || !Number.isFinite(event.pointerPosition?.x) || !Number.isFinite(event.pointerPosition?.y)) return;
    void unlockAudio();
    const point = { x: event.pointerPosition.x, y: event.pointerPosition.y };
    const current = {
      point, sceneKey, itemIds: [], hot: -1,
      ready: false, tail: Promise.resolve(), pendingPosition: null, pendingFinish: null,
    };
    gesture = current;
    try {
      const dpi = await OBR.scene.grid.getDpi();
      if (!ready || gesture !== current || current.sceneKey !== sceneKey) return;
      const items = [makeBillboard(buildBillboard, uiAssets.wheels.caution, point, WHEEL.outerRadius * 2 + 4, dpi, 'wheel', DEFAULT_SIGNAL.label)];
      current.itemIds = items.map(item => item.id);
      await OBR.scene.local.addItems(items);
    } catch (error) {
      if (gesture === current) cancelWheel();
      reportRenderError(OBR, error, version, '轮盘');
      return;
    }
    if (gesture !== current) {
      deleteIds(current.itemIds);
      return;
    }
    current.ready = true;
    if (current.pendingPosition) void move({ pointerPosition: current.pendingPosition });
    if (current.pendingFinish) void finish(current.pendingFinish);
  }

  function move(event) {
    const current = gesture;
    if (!current || !Number.isFinite(event.pointerPosition?.x) || !Number.isFinite(event.pointerPosition?.y)) return;
    const position = { x: event.pointerPosition.x, y: event.pointerPosition.y };
    if (!current.ready) {
      current.pendingPosition = position;
      return;
    }
    current.tail = current.tail.then(async () => {
      if (gesture !== current) return;
      const scale = await OBR.viewport.getScale();
      if (gesture !== current || !Number.isFinite(scale) || scale <= 0) return;
      const next = pickSlice((position.x - current.point.x) * scale, (position.y - current.point.y) * scale);
      if (next === current.hot) return;
      current.hot = next;
      const signal = next < 0 ? DEFAULT_SIGNAL : SIGNALS[next];
      await OBR.scene.local.updateItems(current.itemIds, items => {
        for (const item of items) {
          item.image = uiAssets.wheels[signal.id];
          item.name = signal.label;
        }
      });
    }).catch(error => console.error('[lolPing] Wheel preview failed', error));
  }

  async function finish(event) {
    const current = gesture;
    if (!current) return;
    if (!current.ready) {
      current.pendingFinish = event;
      return;
    }
    move(event);
    await current.tail;
    if (gesture !== current) return;
    gesture = null;
    deleteIds(current.itemIds);
    if (!ready || current.sceneKey !== sceneKey) return;
    const signal = current.hot < 0 ? DEFAULT_SIGNAL : SIGNALS[current.hot];
    const userId = OBR.player.id;
    const message = createPing({ userId, sceneKey, signalId: signal.id, x: current.point.x, y: current.point.y });
    let sender = '房间玩家';
    try {
      sender = await OBR.player.getName() || sender;
    } catch {
      // Keep a generic name when the host does not provide one.
    }
    void showPing(message, sender).catch(error => reportRenderError(OBR, error, version));
    void OBR.broadcast.sendMessage(CHANNEL, message, { destination: 'REMOTE' }).catch(() => {});
  }

  function receive(event) {
    const message = parsePing(event.data);
    if (!message || message.userId === OBR.player.id && event.connectionId === undefined) return;
    void showPing(message, players.get(event.connectionId) ?? '房间玩家').catch(error => reportRenderError(OBR, error, version));
  }

  async function startScene(generation) {
    try {
      const key = await sceneKeyFor(OBR);
      if (closed || generation !== sceneGeneration) return;
      sceneKey = key;
      ready = true;
    } catch {
      if (generation === sceneGeneration) ready = false;
    }
  }

  function sceneChanged(isReady) {
    sceneGeneration++;
    sceneKey = null;
    ready = false;
    cancelWheel();
    clearPings();
    if (isReady) void startScene(sceneGeneration);
  }

  unsubscribers.push(OBR.onReady(async () => {
    if (closed) return;
    try {
      await OBR.tool.create({
        id: TOOL_ID,
        icons: [{ icon: wheelIcon, label: '英雄联盟信号轮盘' }],
        defaultMode: MODE_ID,
      });
    } catch (error) {
      reportStartupError(OBR, '工具栏注册', error);
      return;
    }
    try {
      await OBR.tool.createMode({
        id: MODE_ID,
        icons: [{ icon: wheelIcon, label: '信号轮盘', filter: { activeTools: [TOOL_ID] } }],
        onToolClick: () => false,
        onToolDoubleClick: () => false,
        onToolDown: (_context, event) => { void begin(event); },
        onToolMove: (_context, event) => { void move(event); },
        onToolDragStart: (_context, event) => { void move(event); },
        onToolDragMove: (_context, event) => { void move(event); },
        onToolDragEnd: (_context, event) => { void finish(event); },
        onToolUp: (_context, event) => { void finish(event); },
        onToolDragCancel: cancelWheel,
        onKeyDown: (_context, event) => {
          if (event.key === 'Escape') cancelWheel();
        },
        onDeactivate: cancelWheel,
        onActivate: () => {
          void OBR.notification.show('在地图上按住左键并向信号方向拖动，松开发送；按 Esc 取消。', 'INFO').catch(() => {});
        },
      });
    } catch (error) {
      reportStartupError(OBR, '轮盘模式注册', error);
      await OBR.tool.remove(TOOL_ID).catch(removeError => console.error('[lolPing] Tool cleanup failed', removeError));
      return;
    }

    void OBR.notification.show(`lolPing ${version} 信号轮盘已加载。`, 'SUCCESS').catch(() => {});

    try {
      unsubscribers.push(OBR.broadcast.onMessage(CHANNEL, receive));
      unsubscribers.push(OBR.party.onChange(party => {
        players = new Map(party.map(player => [player.connectionId, player.name || '房间玩家']));
      }));
      unsubscribers.push(OBR.scene.onReadyChange(sceneChanged));
      unsubscribers.push(OBR.scene.onMetadataChange(metadata => {
        const updatedKey = metadata[EXTENSION_ID]?.[SCENE_METADATA_KEY];
        if (ready && validSceneKey(updatedKey) && updatedKey !== sceneKey) {
          sceneKey = updatedKey;
          cancelWheel();
          clearPings();
        }
      }));
      void refreshParty();
      if (await OBR.scene.isReady()) sceneChanged(true);
    } catch (error) {
      reportStartupError(OBR, '房间事件初始化', error);
    }
  }));

  return () => {
    closed = true;
    sceneGeneration++;
    ready = false;
    cancelWheel();
    clearPings();
    for (const unsubscribe of unsubscribers) unsubscribe?.();
    void OBR.tool.removeMode(MODE_ID).catch(() => {});
    void OBR.tool.remove(TOOL_ID).catch(() => {});
  };
}
