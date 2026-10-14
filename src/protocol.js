import { signalById } from './signals.js';

const VERSION = 1;
const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_COORDINATE = 1_000_000;

function validCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function parsePing(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { v, type, eventId, userId, sceneKey, signalId, x, y } = raw;
  if (v !== VERSION || type !== 'ping' || !IDENTIFIER.test(eventId ?? '') || !IDENTIFIER.test(userId ?? '')
    || !IDENTIFIER.test(sceneKey ?? '') || !signalById(signalId) || !validCoordinate(x) || !validCoordinate(y)) return null;
  return { v: VERSION, type, eventId, userId, sceneKey, signalId, x, y };
}

export function createPing({ userId, sceneKey, signalId, x, y }) {
  const message = parsePing({
    v: VERSION, type: 'ping', eventId: crypto.randomUUID(), userId, sceneKey, signalId, x, y,
  });
  if (!message) throw new TypeError('Invalid signal ping');
  return message;
}
