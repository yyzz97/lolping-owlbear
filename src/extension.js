import { DEFAULT_SIGNAL, SIGNALS, signalById } from './signals.js';
import { WHEEL, circleCommands, pickSlice, sectorCommands, spokeCommands } from './geometry.js';
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

function line(points) {
  return points.map(([x, y], index) => [index === 0 ? 0 : 1, x, y]);
}

function circleAt(commands, x, y, radius, segments = 12) {
  commands.push([0, x + radius, y]);
  for (let index = 1; index < segments; index++) {
    const angle = index * Math.PI * 2 / segments;
    commands.push([1, x + radius * Math.cos(angle), y + radius * Math.sin(angle)]);
  }
  commands.push([5]);
}

function signalIcon(signalId) {
  const commands = [];
  switch (signalId) {
    case 'retreat':
      commands.push(...line([[0, -22], [21, 16], [-21, 16], [0, -22]]));
      commands.push(...line([[0, -9], [0, 3]]));
      circleAt(commands, 0, 9, 2.4);
      break;
    case 'push':
      commands.push(...line([[-18, 10], [-6, -16], [1, -16], [13, 5]]));
      commands.push(...line([[-11, 15], [1, -11], [8, -11], [18, 7], [10, 13], [5, 4], [1, 14], [-4, 12], [-8, 18], [-11, 15]]));
      break;
    case 'omw':
      commands.push(...line([[-7, -20], [7, -20], [7, 5], [17, -3], [17, 6], [0, 19], [-17, 6], [-17, -3], [-7, 5], [-7, -20]]));
      break;
    case 'allin':
      commands.push(...line([[-18, -15], [15, 18], [18, 15], [-15, -18], [-18, -15]]));
      commands.push(...line([[18, -15], [-15, 18], [-18, 15], [15, -18], [18, -15]]));
      commands.push(...line([[-22, -11], [-15, -21], [-8, -13], [-14, -6], [-22, -11]]));
      commands.push(...line([[22, -11], [15, -21], [8, -13], [14, -6], [22, -11]]));
      break;
    case 'assist':
      commands.push(...line([[-10, 21], [-10, -15], [-4, -13], [0, -16], [6, -12], [12, -15], [12, 1], [7, 5], [0, 2], [-4, 6], [-4, 22]]));
      commands.push(...line([[0, -16], [0, 9]]));
      break;
    case 'hold':
      commands.push(...line([[-19, -15], [0, -20], [19, -15], [16, 7], [0, 20], [-16, 7], [-19, -15]]));
      commands.push(...line([[-10, -9], [0, -12], [10, -9], [8, 4], [0, 12], [-8, 4], [-10, -9]]));
      break;
    case 'missing':
      commands.push([0, -12, -9], [4, -8, -21, 13, -20, 12, -8], [4, 12, 0, 1, 2, 1, 8]);
      circleAt(commands, 1, 16, 2.5);
      break;
    case 'bait':
      commands.push([0, -3, 12], [4, -13, 8, -17, -1, -9, -10], [4, -3, -18, 6, -13, 7, -5]);
      circleAt(commands, 7, -14, 4, 12);
      commands.push(...line([[4, -4], [12, -1], [19, -6]]));
      break;
    case 'caution':
      circleAt(commands, 0, 0, 17, 32);
      commands.push(...line([[-9, 0], [9, 0]]));
      break;
  }
  return commands;
}

function makeSignalIcon({ signalId, point, scale, buildPath, buildImage, signalAssets, size = WHEEL.iconSize, color, itemType = 'glyph' }) {
  const tint = color ?? signalById(signalId)?.color ?? DEFAULT_SIGNAL.color;
  const inverseScale = 1 / Math.max(scale, 0.05);
  const iconScale = inverseScale * size / WHEEL.iconSize;
  const asset = signalAssets?.[signalId];
  if (buildImage && asset?.imageUrl) {
    return buildImage(
      { width: asset.width, height: asset.height, mime: 'image/png', url: asset.imageUrl },
      { offset: { x: 0, y: 0 }, dpi: 1 },
    )
      .id(`${EXTENSION_ID}/${itemType}/${crypto.randomUUID()}`)
      .position(point)
      .scale({ x: inverseScale * size / asset.width, y: inverseScale * size / asset.height })
      .layer('POPOVER')
      .disableHit(true)
      .disableAutoZIndex(true)
      .build();
  }
  return buildPath()
    .id(`${EXTENSION_ID}/${itemType}/${crypto.randomUUID()}`)
    .commands(signalIcon(signalId))
    .position(point)
    .scale({ x: iconScale, y: iconScale })
    .fillColor(tint)
    .fillOpacity(signalId === 'caution' ? 0 : 0.92)
    .strokeColor(tint)
    .strokeOpacity(0.96)
    .strokeWidth(2.8)
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build();
}

function makeWheelItems({ point, scale, buildPath, buildImage, signalAssets, buildLabel }) {
  const inverseScale = 1 / Math.max(scale, 0.05);
  const items = [];
  const wedgeIds = [];
  SIGNALS.forEach((signal, index) => {
    const wedge = buildPath()
      .id(`${EXTENSION_ID}/wheel/${crypto.randomUUID()}`)
      .commands(sectorCommands(index))
      .position(point)
      .scale({ x: inverseScale, y: inverseScale })
      .fillColor('#17252a')
      .fillOpacity(0.035)
      .strokeOpacity(0)
      .layer('POPOVER')
      .disableHit(true)
      .disableAutoZIndex(true)
      .build();
    wedgeIds.push(wedge.id);
    items.push(wedge);

    const angle = (-90 + index * 45) * Math.PI / 180;
    const iconPoint = {
      x: point.x + Math.cos(angle) * WHEEL.iconRadius * inverseScale,
      y: point.y + Math.sin(angle) * WHEEL.iconRadius * inverseScale,
    };
    items.push(makeSignalIcon({ signalId: signal.id, point: iconPoint, scale, buildPath, buildImage, signalAssets, itemType: 'wheel-glyph' }));
  });

  items.push(buildPath()
    .id(`${EXTENSION_ID}/rim/${crypto.randomUUID()}`)
    .commands(spokeCommands())
    .position(point)
    .scale({ x: inverseScale, y: inverseScale })
    .fillOpacity(0)
    .strokeColor('#c8aa6e')
    .strokeOpacity(0.42)
    .strokeWidth(0.9)
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build());

  items.push(buildPath()
    .id(`${EXTENSION_ID}/core/${crypto.randomUUID()}`)
    .commands(circleCommands(WHEEL.innerRadius - 2))
    .position(point)
    .scale({ x: inverseScale, y: inverseScale })
    .fillColor('#0b2426')
    .fillOpacity(0.82)
    .strokeColor('#c8aa6e')
    .strokeOpacity(0.98)
    .strokeWidth(2.2)
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build());

  const centerIcon = makeSignalIcon({ signalId: DEFAULT_SIGNAL.id, point: { x: point.x, y: point.y - 48 * inverseScale }, scale, buildPath, buildImage, signalAssets, size: 36, itemType: 'center-glyph' });
  items.push(centerIcon);
  const centerLabelId = `${EXTENSION_ID}/center-label/${crypto.randomUUID()}`;
  items.push(buildLabel()
    .id(centerLabelId)
    .plainText(DEFAULT_SIGNAL.label)
    .fontFamily('Noto Sans, sans-serif')
    .fontSize(19)
    .fontWeight(700)
    .fillColor(DEFAULT_SIGNAL.color)
    .backgroundOpacity(0)
    .width(150)
    .height(32)
    .position({ x: point.x, y: point.y + 2 * inverseScale })
    .scale({ x: inverseScale, y: inverseScale })
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build());

  items.push(buildLabel()
    .id(`${EXTENSION_ID}/back/${crypto.randomUUID()}`)
    .plainText('◉  Back')
    .fontFamily('Noto Sans, sans-serif')
    .fontSize(14)
    .fontWeight(600)
    .fillColor('#b8afb0')
    .backgroundOpacity(0)
    .width(108)
    .height(28)
    .position({ x: point.x, y: point.y + 48 * inverseScale })
    .scale({ x: inverseScale, y: inverseScale })
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build());

  return { items, wedgeIds, centerIconId: centerIcon.id, centerLabelId };
}

function makePingItems({ point, scale, signal, sender, buildPath, buildImage, signalAssets, buildLabel }) {
  const inverseScale = 1 / Math.max(scale, 0.05);
  const ring = buildPath()
    .id(`${EXTENSION_ID}/ring/${crypto.randomUUID()}`)
    .commands(circleCommands(28))
    .position(point)
    .scale({ x: inverseScale, y: inverseScale })
    .fillOpacity(0)
    .strokeColor(signal.color)
    .strokeOpacity(0.95)
    .strokeWidth(3.4)
    .layer('POPOVER')
    .disableHit(true)
    .build();
  const label = buildLabel()
    .id(`${EXTENSION_ID}/ping/${crypto.randomUUID()}`)
    .plainText(`${signal.name} · ${sender}`)
    .fontFamily('Noto Sans, sans-serif')
    .fontSize(16)
    .fontWeight(700)
    .fillColor('#fff7e8')
    .width(192)
    .height(34)
    .backgroundColor('#172126')
    .backgroundOpacity(0.9)
    .cornerRadius(8)
    .position({ x: point.x, y: point.y + 45 * inverseScale })
    .scale({ x: inverseScale, y: inverseScale })
    .layer('POPOVER')
    .disableHit(true)
    .build();
  const disk = buildPath()
    .id(`${EXTENSION_ID}/marker/${crypto.randomUUID()}`)
    .commands(circleCommands(21))
    .position(point)
    .scale({ x: inverseScale, y: inverseScale })
    .fillColor('#10191d')
    .fillOpacity(0.96)
    .strokeColor(signal.color)
    .strokeOpacity(0.82)
    .strokeWidth(1.2)
    .layer('POPOVER')
    .disableHit(true)
    .build();
  const icon = makeSignalIcon({ signalId: signal.id, point, scale, buildPath, buildImage, signalAssets, size: 34, itemType: 'ping-glyph' });
  return [ring, disk, icon, label];
}

export function registerExtension(OBR, { buildImage, buildPath, buildLabel, signalAssets, wheelIcon }) {
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
    const items = makePingItems({ point: { x: message.x, y: message.y }, scale, signal, sender, buildPath, buildImage, signalAssets, buildLabel });
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
    const scale = await OBR.viewport.getScale().catch(() => 1);
    if (!ready || gesture) return;
    const { items, wedgeIds, centerIconId, centerLabelId } = makeWheelItems({ point, scale, buildPath, buildImage, signalAssets, buildLabel });
    const current = {
      point, scale, sceneKey, wedgeIds, centerIconId, centerLabelId, itemIds: items.map(item => item.id), hot: -1,
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
    const next = pickSlice((position.x - current.point.x) * current.scale, (position.y - current.point.y) * current.scale);
    if (next === current.hot) return;
    const previous = current.hot;
    current.hot = next;
    const updates = [];
    if (previous >= 0) updates.push({ id: current.wedgeIds[previous], opacity: 0.035 });
    if (next >= 0) updates.push({ id: current.wedgeIds[next], opacity: 0.2 });
    current.tail = current.tail.then(async () => {
      if (gesture !== current) return;
      for (const update of updates) {
        await OBR.scene.local.updateItems([update.id], items => {
          for (const item of items) item.style.fillOpacity = update.opacity;
        });
      }
      const signal = next < 0 ? DEFAULT_SIGNAL : SIGNALS[next];
      await OBR.scene.local.updateItems([current.centerIconId, current.centerLabelId], items => {
        for (const item of items) {
          if (item.type === 'PATH') {
            item.commands = signalIcon(signal.id);
            item.style.strokeColor = signal.color;
            item.style.fillColor = signal.color;
          } else if (item.type === 'IMAGE' && signalAssets?.[signal.id]?.imageUrl) {
            const asset = signalAssets[signal.id];
            item.image = { width: asset.width, height: asset.height, mime: 'image/png', url: asset.imageUrl };
            const centerSize = 36;
            item.scale = { x: 1 / Math.max(current.scale, 0.05) * centerSize / asset.width, y: 1 / Math.max(current.scale, 0.05) * centerSize / asset.height };
          } else {
            item.text.plainText = signal.label;
            item.text.style.fillColor = signal.color;
          }
        }
      });
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
