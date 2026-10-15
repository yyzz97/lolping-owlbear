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
  playPing('retreat');

  assert.equal(oscillators.length, 2);
  assert.equal(oscillators[0].startedAt, 5);
  assert.equal(oscillators[1].startedAt, 5.045);
  assert.equal(oscillators[0].frequency.initialValue, 784 * 1.04);
  assert.equal(oscillators[0].frequency.finalValue, 784);
  assert.equal(oscillators[0].type, 'triangle');
  assert.ok(Math.abs(oscillators[0].stoppedAt - 5.125) < 1e-9);
  assert.ok(Math.abs(oscillators[1].stoppedAt - 5.205) < 1e-9);
});

test('plays a supplied OGG cue when the browser Audio API is available', async t => {
  const previousAudio = globalThis.Audio;
  const played = [];
  globalThis.Audio = class AudioMock {
    constructor(url) { this.url = url; played.push(this); }
    play() { this.started = true; return Promise.resolve(); }
  };
  t.after(() => {
    if (previousAudio === undefined) delete globalThis.Audio;
    else globalThis.Audio = previousAudio;
  });

  const { playPing } = await import('../src/audio.js');
  const audio = playPing('bait', '/assets/Bait_ping_SFX.ogg');
  assert.equal(audio.url, '/assets/Bait_ping_SFX.ogg');
  assert.equal(audio.started, true);
  assert.equal(played.length, 1);
});
