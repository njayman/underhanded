import { mulberry32 } from '../rules/rng';

// All game audio, synthesised with Web Audio: no sound files to ship or license.
// Nothing here affects gameplay. Browsers start audio suspended until a tap: call unlockAudio() on input.

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;
let muted = false;
const texture = mulberry32(99); // varies noise texture only; never gameplay

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null; // no audio device: the game plays silent
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.32;
  musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // one second of white noise, seeded
  const rng = mulberry32(7);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  return ctx;
}

export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume();
}

export function setMuted(value: boolean): void {
  muted = value;
  if (ctx) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.02);
}

// A pitched blip with an exponential decay, optionally sliding in pitch.
function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, at = 0, bus?: AudioNode): void {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus ?? sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Filtered noise: thuds, swishes, rumbles, snares.
function burst(dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass', at = 0, q = 1, bus?: AudioNode): void {
  const c = audio();
  if (!c || muted) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus ?? sfxBus);
  src.start(t, texture() * 0.5);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  // Hammer lands. heavier = bigger hammer or a killing blow.
  bonk(heavy = 1): void {
    tone(150 * (1.1 - Math.min(heavy, 2) * 0.15), 0.16, 'sine', 0.9, 45);
    burst(0.05, 0.6, 1800, 'bandpass', 0, 0.8);
  },
  // Hit that did not finish the mole.
  hurt(): void {
    tone(230, 0.09, 'triangle', 0.45, 120);
    burst(0.04, 0.35, 2500);
  },
  whiff(): void {
    burst(0.12, 0.25, 3200, 'highpass', 0, 0.6);
  },
  golden(): void {
    tone(1320, 0.25, 'triangle', 0.35);
    tone(1760, 0.35, 'triangle', 0.3, undefined, 0.06);
  },
  decoy(): void {
    tone(110, 0.28, 'square', 0.28, 90);
    tone(116, 0.28, 'square', 0.22, 95);
  },
  lifeLost(): void {
    tone(520, 0.4, 'sawtooth', 0.2, 180);
  },
  shieldSaved(): void {
    tone(880, 0.12, 'square', 0.18);
    tone(660, 0.18, 'square', 0.15, undefined, 0.08);
  },
  comboBreak(): void {
    burst(0.25, 0.4, 5000, 'highpass', 0, 0.5);
    tone(700, 0.3, 'triangle', 0.2, 200);
  },
  // Rising tick as a combo climbs.
  combo(n: number): void {
    tone(400 + Math.min(n, 40) * 22, 0.05, 'square', 0.08);
  },
  meterFull(): void {
    [660, 880, 1100].forEach((f, i) => tone(f, 0.12, 'square', 0.12, undefined, i * 0.06));
  },
  ability(id: string): void {
    if (id === 'quake') {
      burst(0.9, 0.9, 90, 'lowpass', 0, 1);
      tone(60, 0.8, 'sine', 0.8, 30);
    } else if (id === 'freeze') {
      [2093, 2637, 3136, 4186].forEach((f, i) => tone(f, 0.5, 'sine', 0.08, undefined, i * 0.04));
      burst(0.5, 0.15, 6000, 'highpass');
    } else if (id === 'trap') {
      tone(300, 0.08, 'square', 0.25);
      burst(0.08, 0.5, 900, 'bandpass', 0.05, 2);
    } else if (id === 'trapSnap') {
      burst(0.1, 0.8, 1200, 'bandpass', 0, 3);
      tone(200, 0.15, 'square', 0.3, 80);
    } else {
      tone(220, 0.6, 'sawtooth', 0.18, 880); // frenzy: rising rip
      burst(0.4, 0.2, 2000, 'bandpass', 0.1);
    }
  },
  bossIn(): void {
    [0, 0.18].forEach((at) => [147, 175, 220].forEach((f) => tone(f, 0.5, 'sawtooth', 0.12, undefined, at)));
    burst(0.5, 0.7, 120, 'lowpass', 0, 1);
  },
  bossDown(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.14, undefined, i * 0.08));
    burst(0.6, 0.6, 150, 'lowpass', 0.3);
  },
  whistle(): void {
    tone(2200, 0.18, 'sine', 0.25, 2350);
    tone(2200, 0.5, 'sine', 0.25, 2400, 0.22);
  },
  sacked(): void {
    [311, 294, 277].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.16, f * 0.97, i * 0.38));
    tone(262, 0.9, 'sawtooth', 0.16, 180, 1.14);
  },
  coin(): void {
    tone(988, 0.07, 'square', 0.14);
    tone(1319, 0.2, 'square', 0.14, undefined, 0.07);
  },
  click(): void {
    tone(900, 0.03, 'square', 0.08);
  },
  deny(): void {
    tone(140, 0.15, 'square', 0.15, 110);
  },
};

// The shift's music: a small step sequencer. level 0 normal, 1 hot combo, 2 boss or frenzy.
const BASS = [45, 0, 45, 48, 0, 45, 52, 0, 45, 0, 45, 50, 0, 48, 43, 0]; // MIDI notes, 0 = rest
const LEAD = [69, 0, 72, 0, 76, 0, 72, 0, 74, 0, 72, 0, 69, 0, 67, 0];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
let timer: ReturnType<typeof setInterval> | null = null;
let step = 0;
let nextAt = 0;
let level = 0;

function playStep(at: number): void {
  const c = ctx!;
  const off = at - c.currentTime;
  const s = step % 16;
  if (s % 4 === 0) tone(110, 0.18, 'sine', 0.9, 40, off, musicBus); // kick
  if (s === 4 || s === 12) burst(0.14, 0.5, 1800, 'bandpass', off, 0.7, musicBus); // snare
  if (s % 2 === 1 || level > 0) burst(0.03, level > 0 ? 0.22 : 0.14, 8000, 'highpass', off, 0.7, musicBus); // hats
  if (BASS[s]) tone(midi(BASS[s]), 0.2, 'square', 0.22, undefined, off, musicBus);
  if (level === 2 && LEAD[s]) tone(midi(LEAD[s]), 0.12, 'square', 0.1, undefined, off, musicBus);
  step++;
}

export const music = {
  start(): void {
    const c = audio();
    if (!c || timer) return;
    step = 0;
    nextAt = c.currentTime + 0.1;
    timer = setInterval(() => {
      if (muted) return;
      const bpm = [116, 128, 140][level];
      while (nextAt < c.currentTime + 0.12) {
        playStep(nextAt);
        nextAt += 60 / bpm / 4;
      }
      if (nextAt < c.currentTime) nextAt = c.currentTime + 0.05; // after a stall (backgrounded tab), do not machine-gun
    }, 25);
  },
  setLevel(value: 0 | 1 | 2): void {
    level = value;
  },
  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  },
};
