import test from 'node:test';
import assert from 'node:assert/strict';
import { playPing, unlockAudio } from '../src/audio.js';

test('audio unlock resumes a context and plays a short signal-specific ping locally', async t => {
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
        frequency: {
          setValueAtTime(value) { this.initialValue = value; },
          exponentialRampToValueAtTime(value) { this.finalValue = value; },
        },
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
  playPing('danger');

  assert.equal(oscillators.length, 2);
  assert.equal(oscillators[0].startedAt, 5);
  assert.equal(oscillators[1].startedAt, 5.045);
  assert.equal(oscillators[0].frequency.initialValue, 784 * 1.04);
  assert.equal(oscillators[0].frequency.finalValue, 784);
  assert.equal(oscillators[0].type, 'triangle');
  assert.ok(Math.abs(oscillators[0].stoppedAt - 5.125) < 1e-9);
  assert.ok(Math.abs(oscillators[1].stoppedAt - 5.205) < 1e-9);
});
