import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSlice, sectorCommands, circleCommands } from '../src/geometry.js';

test('the eight compass directions select clockwise wheel sectors', () => {
  for (let index = 0; index < 8; index++) {
    const angle = (-90 + index * 45) * Math.PI / 180;
    assert.equal(pickSlice(Math.cos(angle) * 150, Math.sin(angle) * 150), index);
  }
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
