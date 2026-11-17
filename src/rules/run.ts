import { hashString, mulberry32 } from './rng';

// One run: a chain of shifts from depth 1 until the player is sacked.
export interface Run {
  id: string; // uuid, the leaderboard's one-submission-per-run key
  seed: number;
  daily: string | null; // UTC date key for a daily run, null for an ordinary run
  depth: number; // shift about to be played, 1-based
  gold: number; // banked from cleared shifts
  tools: string[]; // drafted tool ids, repeats mean stacks
  revived: boolean; // the one revive per run has been used
  elapsedMs: number; // shift time actually played, all shifts; the leaderboard checks depth against it
}

export const newRun = (seed: number, id = randomId()): Run =>
  ({ id, seed, daily: null, depth: 1, gold: 0, tools: [], revived: false, elapsedMs: 0 });

// Random uuid v4 for run and player ids. Not gameplay randomness. getRandomValues, not randomUUID:
// randomUUID is missing on plain-http pages, such as the dev server opened from another device.
export function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// The daily run: everyone who plays on the same UTC day gets the same seed.
export const utcDateKey = (now: Date): string => now.toISOString().slice(0, 10);
export function newDailyRun(now: Date): Run {
  const daily = utcDateKey(now);
  return { ...newRun(hashString(`daily:${daily}`)), daily };
}

// A fresh random stream for one purpose at the run's current depth. Each shift's spawns, boss hops and
// draft get their own stream, so one player's taps or earlier shifts cannot change what another sees.
export type Stream = 'spawn' | 'hop' | 'draft' | 'reroll';
export const streamFor = (run: Run, purpose: Stream): (() => number) =>
  mulberry32(hashString(`${run.seed}:${run.depth}:${purpose}`));
