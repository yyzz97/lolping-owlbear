import test from 'node:test';
import assert from 'node:assert/strict';
import { WHEEL, pickSlice, sectorCommands, circleCommands } from '../src/geometry.js';
import { SIGNALS } from '../src/signals.js';

test('wheel sectors follow the reference image clockwise from the top', () => {
  assert.deepEqual(SIGNALS.map(signal => signal.id), [
    'retreat', 'bait', 'omw', 'allin', 'assist', 'hold', 'missing', 'push',
  ]);
});

test('the eight compass directions select clockwise wheel sectors', () => {
  for (let index = 0; index < 8; index++) {
    const angle = (-90 + index * 45) * Math.PI / 180;
    assert.equal(pickSlice(Math.cos(angle) * 150, Math.sin(angle) * 150), index);
  }
});

test('the center radius is half the outer radius and selection begins at the inner edge', () => {
  assert.equal(WHEEL.innerRadius / WHEEL.outerRadius, 0.5);
  assert.equal(pickSlice(WHEEL.innerRadius - 1, 0), -1);
  assert.equal(pickSlice(WHEEL.innerRadius, 0), 2);
  const commands = sectorCommands(2);
  assert.ok(Math.abs(Math.hypot(...commands[0].slice(1)) - WHEEL.innerRadius) < 0.0001);
  assert.ok(Math.abs(Math.hypot(...commands[1].slice(1)) - WHEEL.outerRadius) < 0.0001);
});

test('the center and invalid pointer positions cancel', () => {
  assert.equal(pickSlice(0, 0), -1);
  assert.equal(pickSlice(1, 0), -1);
  assert.equal(pickSlice(NaN, 10), -1);
  assert.equal(pickSlice(Infinity, 10), -1);
});

test('every sector path closes and the core path has a closed outline', () => {
  for (let index = 0; index < 8; index++) {
    const commands = sectorCommands(index);
    assert.deepEqual(commands[0].slice(0, 1), [0]);
    assert.deepEqual(commands.at(-1), [5]);
    assert.ok(commands.length > 15);
  }
  assert.deepEqual(circleCommands(20).at(-1), [5]);
});
