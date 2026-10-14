import { SIGNALS, signalById } from './signals.js';
import { WHEEL, circleCommands, pickSlice, sectorCommands } from './geometry.js';
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

function makeWheelItems({ point, scale, buildPath, buildLabel }) {
  const inverseScale = 1 / Math.max(scale, 0.05);
  const items = [];
  const wedgeIds = [];
  SIGNALS.forEach((signal, index) => {
    const wedge = buildPath()
      .id(`${EXTENSION_ID}/wheel/${crypto.randomUUID()}`)
      .commands(sectorCommands(index))
      .position(point)
      .scale({ x: inverseScale, y: inverseScale })
      .fillColor('#5b6069')
      .fillOpacity(0.32)
      .strokeColor('#b49b69')
      .strokeOpacity(0.22)
      .strokeWidth(1)
      .layer('POPOVER')
      .disableHit(true)
      .disableAutoZIndex(true)
      .build();
    wedgeIds.push(wedge.id);
    items.push(wedge);

    const angle = (-90 + index * 45) * Math.PI / 180;
    const label = buildLabel()
      .id(`${EXTENSION_ID}/icon/${crypto.randomUUID()}`)
      .plainText(signal.icon)
      .fontFamily('Noto Sans, Segoe UI Symbol, sans-serif')
      .fontSize(34)
      .fontWeight(700)
      .fillColor('#eee1b5')
      .backgroundOpacity(0)
      .width(58)
      .height(58)
      .position({
        x: point.x + Math.cos(angle) * WHEEL.iconRadius * inverseScale,
        y: point.y + Math.sin(angle) * WHEEL.iconRadius * inverseScale,
      })
      .scale({ x: inverseScale, y: inverseScale })
      .layer('POPOVER')
      .disableHit(true)
      .disableAutoZIndex(true)
      .build();
    items.push(label);
  });

  items.push(buildPath()
    .id(`${EXTENSION_ID}/core/${crypto.randomUUID()}`)
    .commands(circleCommands(WHEEL.innerRadius - 2))
    .position(point)
    .scale({ x: inverseScale, y: inverseScale })
    .fillColor('#12343a')
    .fillOpacity(0.96)
    .strokeColor('#c8aa6e')
    .strokeOpacity(0.96)
    .strokeWidth(3)
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build());

  items.push(buildLabel()
    .id(`${EXTENSION_ID}/center/${crypto.randomUUID()}`)
    .plainText('信号\n松开取消')
    .fontFamily('Noto Sans, sans-serif')
    .fontSize(15)
    .fontWeight(600)
    .fillColor('#75c8e7')
    .backgroundOpacity(0)
    .width(108)
    .height(58)
    .position(point)
    .scale({ x: inverseScale, y: inverseScale })
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build());

  return { items, wedgeIds };
}

function makePingItems({ point, scale, signal, sender, buildPath, buildLabel }) {
  const label = buildLabel()
    .id(`${EXTENSION_ID}/ping/${crypto.randomUUID()}`)
    .plainText(`${signal.icon}  ${signal.name}\n${sender}`)
    .fontFamily('Noto Sans, sans-serif')
    .fontSize(18)
    .fontWeight(700)
    .fillColor('#fff7e8')
    .width(176)
    .height(56)
    .backgroundColor('#172126')
    .backgroundOpacity(0.9)
    .cornerRadius(12)
    .position(point)
    .scale({ x: 1 / Math.max(scale, 0.05), y: 1 / Math.max(scale, 0.05) })
    .layer('POPOVER')
    .disableHit(true)
    .build();
  const ring = buildPath()
    .id(`${EXTENSION_ID}/ring/${crypto.randomUUID()}`)
    .commands(circleCommands(27))
    .position(point)
    .scale({ x: 1 / Math.max(scale, 0.05), y: 1 / Math.max(scale, 0.05) })
    .strokeColor(signal.color)
    .strokeOpacity(0.95)
    .strokeWidth(4)
    .fillOpacity(0)
    .layer('POPOVER')
    .disableHit(true)
    .build();
  return [ring, label];
}

export function registerExtension(OBR, { buildPath, buildLabel, wheelIcon }) {
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
    const scale = await OBR.viewport.getScale().catch(() => 1);
    if (!ready || key !== sceneKey) return false;
    const items = makePingItems({ point: { x: message.x, y: message.y }, scale, signal, sender, buildPath, buildLabel });
    const ids = items.map(item => item.id);
    const token = Symbol('ping');
    const entry = { ids, timer: null };
    localPings.set(token, entry);
    void OBR.scene.local.addItems(items).then(() => {
      if (!localPings.has(token) || !ready || message.sceneKey !== sceneKey) {
        localPings.delete(token);
        deleteIds(ids);
        return;
      }
      entry.timer = setTimeout(() => {
        localPings.delete(token);
        deleteIds(ids);
      }, DISPLAY_MS);
    }).catch(() => localPings.delete(token));
    await unlockAudio();
    playPing();
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
    const scale = await OBR.viewport.getScale().catch(() => 1);
    if (!ready || gesture) return;
    const { items, wedgeIds } = makeWheelItems({ point, scale, buildPath, buildLabel });
    const current = {
      point, sceneKey, wedgeIds, itemIds: items.map(item => item.id), hot: -1,
      ready: false, tail: Promise.resolve(), pendingPosition: null, pendingFinish: null,
    };
    gesture = current;
    await OBR.scene.local.addItems(items).catch(() => {});
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
    const next = pickSlice(position.x - current.point.x, position.y - current.point.y);
    if (next === current.hot) return;
    const previous = current.hot;
    current.hot = next;
    const updates = [];
    if (previous >= 0) updates.push({ id: current.wedgeIds[previous], opacity: 0.32 });
    if (next >= 0) updates.push({ id: current.wedgeIds[next], opacity: 0.68 });
    current.tail = current.tail.then(async () => {
      if (gesture !== current) return;
      for (const update of updates) {
        await OBR.scene.local.updateItems([update.id], items => {
          for (const item of items) item.style.fillOpacity = update.opacity;
        });
      }
    }).catch(() => {});
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
    if (!ready || current.sceneKey !== sceneKey || current.hot < 0) return;
    const signal = SIGNALS[current.hot];
    const userId = OBR.player.id;
    const message = createPing({ userId, sceneKey, signalId: signal.id, x: current.point.x, y: current.point.y });
    let sender = '房间玩家';
    try {
      sender = await OBR.player.getName() || sender;
    } catch {
      // Keep a generic name when the host does not provide one.
    }
    showPing(message, sender);
    void OBR.broadcast.sendMessage(CHANNEL, message, { destination: 'REMOTE' }).catch(() => {});
  }

  function receive(event) {
    const message = parsePing(event.data);
    if (!message || message.userId === OBR.player.id && event.connectionId === undefined) return;
    showPing(message, players.get(event.connectionId) ?? '房间玩家');
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

    void OBR.notification.show('lolPing 信号轮盘已加载。', 'SUCCESS').catch(() => {});

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
