import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePing } from '../src/protocol.js';
import { SIGNALS } from '../src/signals.js';

const valid = {
  v: 1,
  type: 'ping',
  eventId: 'event-1',
  userId: 'player-1',
  sceneKey: 'scene-1',
  signalId: 'retreat',
  x: 420,
  y: -60,
};

test('a valid message preserves world coordinates and strips sender-provided display data', () => {
  const raw = { ...valid, playerName: '<img>', imageUrl: 'https://invalid.test/icon.png', extra: true };
  assert.deepEqual(parsePing(raw), valid);
});

test('only the eight supported signal IDs can be sent', () => {
  assert.equal(SIGNALS.length, 8);
  for (const signal of SIGNALS) assert.equal(parsePing({ ...valid, signalId: signal.id })?.signalId, signal.id);
  assert.equal(parsePing({ ...valid, signalId: 'danger' })?.signalId, 'danger');
  assert.equal(parsePing({ ...valid, signalId: 'custom' }), null);
  assert.equal(parsePing({ ...valid, signalId: '__proto__' }), null);
});

test('malformed, oversized and non-finite messages are rejected', () => {
  for (const raw of [null, [], 'ping', {}, { ...valid, v: 2 }, { ...valid, type: 'emote' }]) {
    assert.equal(parsePing(raw), null);
  }
  for (const key of ['eventId', 'userId', 'sceneKey']) {
    for (const value of ['', '../scene', 'x'.repeat(129), null]) {
      assert.equal(parsePing({ ...valid, [key]: value }), null, `${key}: ${String(value)}`);
    }
  }
  for (const key of ['x', 'y']) {
    for (const value of [NaN, Infinity, -Infinity, '42', null, 1_000_001]) {
      assert.equal(parsePing({ ...valid, [key]: value }), null, `${key}: ${String(value)}`);
    }
  }
});
