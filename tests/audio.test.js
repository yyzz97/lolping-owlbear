import test from 'node:test';
import assert from 'node:assert/strict';
import { playPing, unlockAudio } from '../src/audio.js';

test('audio unlock resumes a context and plays the two-tone ping locally', async t => {
  const previousWindow = globalThis.window;
  const oscillators = [];

  class AudioContextMock {
    state = 'suspended';
    currentTime = 5;
    destination = {};

    async resume() {
      this.state = 'running';
    }

    createOscillator() {
      const oscillator = {
        frequency: { setValueAtTime() {} },
        connect(target) { return target; },
        start(time) { this.startedAt = time; },
        stop(time) { this.stoppedAt = time; },
      };
      oscillators.push(oscillator);
      return oscillator;
    }

    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect(target) { return target; },
      };
    }
  }

  globalThis.window = { AudioContext: AudioContextMock };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  await unlockAudio();
  playPing();

  assert.equal(oscillators.length, 2);
  assert.equal(oscillators[0].startedAt, 5);
  assert.equal(oscillators[1].startedAt, 5.07);
  assert.equal(oscillators[0].stoppedAt, 5.2);
  assert.ok(Math.abs(oscillators[1].stoppedAt - 5.27) < 1e-9);
});
