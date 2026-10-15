import { DEFAULT_SIGNAL, SIGNALS, signalById } from './signals.js';
import { WHEEL, pickSlice } from './geometry.js';
import { createPing, parsePing } from './protocol.js';
import { playPing, unlockAudio } from './audio.js';

export const EXTENSION_ID = 'com.github.dmhpj.lolping-owlbear';
export const TOOL_ID = `${EXTENSION_ID}/tool`;
export const MODE_ID = `${TOOL_ID}/mode`;
export const ACTION_ID = `${EXTENSION_ID}/shortcut`;
export const CHANNEL = `${EXTENSION_ID}/pings`;
export const DISPLAY_MS = 2000;
export const PING_WINDOW_MS = 5000;
export const PING_LIMIT = 4;
export const PING_COOLDOWN_MS = 12000;

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

function makeBillboard(buildBillboard, image, point, width, dpi, itemType, name, offset, zOffset = 0) {
  return buildBillboard(image, { offset: offset ?? { x: image.width / 2, y: image.height / 2 }, dpi })
    .id(`${EXTENSION_ID}/${itemType}/${crypto.randomUUID()}`)
    .name(name)
    .position(point)
    .scale({ x: width / image.width, y: width / image.width })
    .zIndex(Date.now() + zOffset)
    .layer('POPOVER')
    .disableHit(true)
    .disableAutoZIndex(true)
    .build();
}

export function registerExtension(OBR, { buildBillboard, buildLabel, signalAssets, wheelIcon, uiAssets, version = 'dev' }) {
  let sceneKey = null;
  let sceneGeneration = 0;
  let gesture = null;
  let localPings = new Map();
  let players = new Map();
  let ready = false;
  let closed = false;
  let shortcutHeld = false;
  let sendTimes = [];
  let blockedUntil = 0;
  let globalInputBound = false;
  let restoreTool = null;
  const unsubscribers = [];

  function deleteIds(ids) {
    if (ids.length) void OBR.scene.local.deleteItems(ids).catch(() => {});
  }

  function cancelWheel() {
    const current = gesture;
    gesture = null;
    if (current) deleteIds(current.itemIds);
  }

  async function restorePreviousTool() {
    const previous = restoreTool;
    restoreTool = null;
    if (!previous || typeof OBR.tool.activateTool !== 'function') return;
    try {
      await OBR.tool.activateTool(previous.toolId);
      if (previous.modeId && typeof OBR.tool.activateMode === 'function') {
        await OBR.tool.activateMode(previous.toolId, previous.modeId);
      }
    } catch {
      // The previous tool may have been removed while the gesture was active.
    }
  }

  async function activateShortcutTool() {
    if (typeof OBR.tool.getActiveTool !== 'function' || typeof OBR.tool.activateTool !== 'function') return;
    try {
      const activeTool = await OBR.tool.getActiveTool();
      if (activeTool === TOOL_ID) return;
      const activeMode = typeof OBR.tool.getActiveToolMode === 'function'
        ? await OBR.tool.getActiveToolMode() : undefined;
      restoreTool = { toolId: activeTool, modeId: activeMode };
      await OBR.tool.activateTool(TOOL_ID);
    } catch {
      restoreTool = null;
    }
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
    const label = `${sender}${signal.message}`;
    const dpi = await OBR.scene.grid.getDpi();
    if (!ready || key !== sceneKey) return false;
    const image = uiAssets.pings[signal.id];
    const point = { x: message.x, y: message.y };
    const icon = makeBillboard(buildBillboard, image, point, 200, dpi, 'ping', label,
      { x: image.width / 2, y: 100 });
    const text = buildLabel()
      .id(`${EXTENSION_ID}/ping-label/${crypto.randomUUID()}`)
      .name(label)
      .plainText(Array.from(label).slice(0, 100).join(''))
      .position(point)
      .width(360).height(60).padding(0)
      .fontFamily('Microsoft YaHei').fontSize(13).fontWeight(700)
      .textAlign('CENTER').textAlignVertical('BOTTOM')
      .fillColor('#fff7e8').strokeColor('#111b20').strokeWidth(1)
      .backgroundOpacity(0)
      .pointerDirection('UP').pointerWidth(0).pointerHeight(0)
      .zIndex(icon.zIndex + 1).layer('POPOVER')
      .disableHit(true).disableAutoZIndex(true)
      .build();
    const items = [icon, text];
    const ids = items.map(item => item.id);
    const token = Symbol('ping');
    const entry = { ids, timer: null };
    localPings.set(token, entry);
    // Native text avoids the host's image loader and its failure placeholder.
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
      shortcutGesture: shortcutHeld,
      ready: false, updating: false, tail: Promise.resolve(), pendingPosition: null, pendingFinish: null,
    };
    gesture = current;
    try {
      const dpi = await OBR.scene.grid.getDpi();
      if (!ready || gesture !== current || current.sceneKey !== sceneKey) return;
      const wheelWidth = WHEEL.renderOuterRadius * 2 + 4;
      const items = [
        makeBillboard(buildBillboard, uiAssets.wheelBase, point, wheelWidth, dpi, 'wheel-base', 'wheel base', undefined, 0),
        makeBillboard(buildBillboard, uiAssets.wheelSelectionNone, point, wheelWidth, dpi, 'wheel-selection', 'wheel selection', undefined, 1),
        makeBillboard(buildBillboard, uiAssets.wheelCenters.caution, point, wheelWidth, dpi, 'wheel-center', DEFAULT_SIGNAL.label, undefined, 2),
      ];
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
    current.pendingPosition = { x: event.pointerPosition.x, y: event.pointerPosition.y };
    if (!current.ready || current.updating) return;
    current.updating = true;
    current.tail = (async () => {
      try {
        while (gesture === current && current.pendingPosition) {
          const scale = await OBR.viewport.getScale();
          if (gesture !== current) return;
          // Read the newest position after the host replies, skipping stale moves.
          const position = current.pendingPosition;
          current.pendingPosition = null;
          if (!Number.isFinite(scale) || scale <= 0) continue;
          const next = pickSlice((position.x - current.point.x) * scale, (position.y - current.point.y) * scale);
          if (next === current.hot) continue;
          current.hot = next;
          const signal = next < 0 ? DEFAULT_SIGNAL : SIGNALS[next];
          await OBR.scene.local.updateItems(current.itemIds, items => {
            for (const item of items) {
              if (item.id.includes('/wheel-selection/')) item.image = uiAssets.wheelSelections[signal.id];
              if (item.id.includes('/wheel-center/')) item.image = uiAssets.wheelCenters[signal.id];
              if (item.id.includes('/wheel-selection/') || item.id.includes('/wheel-center/')) item.name = signal.label;
            }
          });
        }
      } finally {
        current.updating = false;
      }
    })().catch(error => console.error('[lolPing] Wheel preview failed', error));
  }

  async function finish(event) {
    const current = gesture;
    if (!current) return;
    if (!current.ready) {
      current.pendingFinish = event;
      return;
    }
    if (current.shortcutGesture && !shortcutHeld) {
      cancelWheel();
      return;
    }
    move(event);
    await current.tail;
    if (gesture !== current) return;
    gesture = null;
    deleteIds(current.itemIds);
    if (!ready || current.sceneKey !== sceneKey) return;
    const signal = current.hot < 0 ? DEFAULT_SIGNAL : SIGNALS[current.hot];
    const now = Date.now();
    sendTimes = sendTimes.filter(timestamp => now - timestamp < PING_WINDOW_MS);
    if (now < blockedUntil) {
      void OBR.notification.show(`信号冷却中，还需 ${Math.ceil((blockedUntil - now) / 1000)} 秒。`, 'WARNING').catch(() => {});
      return;
    }
    if (sendTimes.length >= PING_LIMIT) {
      blockedUntil = now + PING_COOLDOWN_MS;
      void OBR.notification.show('信号过于频繁，已进入 12 秒冷却。', 'WARNING').catch(() => {});
      return;
    }
    sendTimes.push(now);
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

  function isShortcutKey(event) {
    return event?.code === 'KeyG' || event?.key?.toLowerCase() === 'g';
  }

  async function screenToolEvent(event) {
    const screenPoint = { x: event.clientX, y: event.clientY };
    const pointerPosition = typeof OBR.viewport.inverseTransformPoint === 'function'
      ? await OBR.viewport.inverseTransformPoint(screenPoint)
      : screenPoint;
    return { pointerPosition, altKey: event.altKey, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey };
  }

  function bindGlobalInput() {
    if (globalInputBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    globalInputBound = true;
    const keyDown = event => {
      if (isShortcutKey(event)) {
        shortcutHeld = true;
        void unlockAudio();
      } else if (event.key === 'Escape') {
        cancelWheel();
      }
    };
    const keyUp = event => {
      if (isShortcutKey(event)) {
        shortcutHeld = false;
        if (gesture?.shortcutGesture) cancelWheel();
        void restorePreviousTool();
      }
    };
    const pointerDown = event => {
      if (event.button !== 0 || !shortcutHeld || gesture) return;
      void screenToolEvent(event).then(begin).catch(() => {});
    };
    const pointerMove = event => {
      if (!gesture?.shortcutGesture) return;
      void screenToolEvent(event).then(move).catch(() => {});
    };
    const pointerUp = event => {
      if (!gesture?.shortcutGesture) return;
      void screenToolEvent(event).then(finish).catch(() => {});
    };
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('keyup', keyUp, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('pointermove', pointerMove, true);
    document.addEventListener('pointerup', pointerUp, true);
    unsubscribers.push(() => {
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('keyup', keyUp, true);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('pointerup', pointerUp, true);
      globalInputBound = false;
    });
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
          if (event.key?.toLowerCase() === 'g' || event.code === 'KeyG') shortcutHeld = true;
          if (event.key === 'Escape') cancelWheel();
        },
        onKeyUp: (_context, event) => {
          if (event.key?.toLowerCase() === 'g' || event.code === 'KeyG') {
            shortcutHeld = false;
            if (gesture) cancelWheel();
            void restorePreviousTool();
          }
        },
        onDeactivate: cancelWheel,
        onActivate: () => {
          void OBR.notification.show('按住 G 和鼠标左键打开轮盘，移动到方向后松开左键发送；松开 G 或按 Esc 取消。', 'INFO').catch(() => {});
        },
      });
      await OBR.tool.createAction({
        id: ACTION_ID,
        shortcut: 'G',
        icons: [{ icon: wheelIcon, label: 'G+鼠标左键信号轮盘', filter: { activeTools: [`${ACTION_ID}/hidden`] } }],
        onClick: () => {
          shortcutHeld = true;
          void activateShortcutTool();
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
      bindGlobalInput();
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
    void OBR.tool.removeAction(ACTION_ID).catch(() => {});
    void OBR.tool.remove(TOOL_ID).catch(() => {});
  };
}
