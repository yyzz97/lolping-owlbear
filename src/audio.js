let context;

export async function unlockAudio() {
  const AudioContextClass = typeof window === 'undefined' ? null : window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    context ??= new AudioContextClass();
    if (context.state === 'suspended') await context.resume();
  } catch {
    // Playback may remain blocked until the player interacts with the room.
  }
}

export function playPing() {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.07, 1174.66]]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.2);
  }
}
