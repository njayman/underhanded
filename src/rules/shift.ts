import { MOLES } from '../data/moles';
import type { ShiftConfig } from '../generation/depth';

export interface ActiveMole {
  kind: string;
  ageMs: number;
  upMs: number;
  hp: number; // 1 for ordinary moles
  hopInMs?: number; // bosses that hop on a timer
}

export type ShiftResult = 'cleared' | 'failed';

export interface ShiftState {
  timeLeftMs: number;
  lives: number;
  gold: number;
  hits: number;
  holes: (ActiveMole | null)[];
  spawnInMs: number;
  decoyShields: number; // remaining this shift
  goldenShields: number;
  bossSpawned: boolean;
  result: ShiftResult | null;
}

export type ShiftEvent =
  | { type: 'spawn'; hole: number; kind: string }
  | { type: 'hit'; hole: number; kind: string; gold: number } // for a boss: the finishing bonk
  | { type: 'bossHit'; hole: number; to: number; kind: string; hpLeft: number } // `to` differs from `hole` if it hopped
  | { type: 'bossHop'; hole: number; to: number; kind: string }
  | { type: 'decoy'; hole: number; kind: string; lifeLost: boolean } // lifeLost false: a shield took it
  | { type: 'escaped'; hole: number; kind: string; lifeLost: boolean; shielded: boolean }
  | { type: 'over'; result: ShiftResult };

export interface Step {
  state: ShiftState;
  events: ShiftEvent[];
}

export function createShift(cfg: ShiftConfig): ShiftState {
  return {
    timeLeftMs: cfg.durationMs,
    lives: cfg.lives,
    gold: 0,
    hits: 0,
    holes: Array.from({ length: cfg.holes }, () => null),
    spawnInMs: cfg.spawnEveryMs,
    decoyShields: cfg.decoyShields,
    goldenShields: cfg.goldenShields,
    bossSpawned: false,
    result: null,
  };
}

function pickWeighted(weights: Record<string, number>, rng: () => number): string {
  const entries = Object.entries(weights);
  let roll = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of entries) {
    roll -= w;
    if (roll < 0) return id;
  }
  return entries[entries.length - 1][0];
}

const emptyHoles = (state: ShiftState): number[] => state.holes.flatMap((m, i) => (m ? [] : [i]));
const pick = <T>(items: T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

function finish(state: ShiftState, events: ShiftEvent[]): Step {
  if (!state.result) {
    if (state.lives <= 0) state.result = 'failed';
    else if (state.timeLeftMs <= 0) state.result = 'cleared';
    if (state.result) events.push({ type: 'over', result: state.result });
  }
  return { state, events };
}

// A mole leaves unbonked. Shields forgive golden moles, never bosses.
function escape(state: ShiftState, hole: number, events: ShiftEvent[]): void {
  const mole = state.holes[hole]!;
  const def = MOLES[mole.kind];
  const shielded = def.missCostsLife && !def.boss && state.goldenShields > 0;
  if (shielded) state.goldenShields -= 1;
  else if (def.missCostsLife) state.lives -= 1;
  state.holes[hole] = null;
  events.push({ type: 'escaped', hole, kind: mole.kind, lifeLost: def.missCostsLife && !shielded, shielded });
}

// Move a mole to a random empty hole. Returns where it ended up (unchanged if the board is full).
function hop(state: ShiftState, from: number, rng: () => number): number {
  const empty = emptyHoles(state);
  if (empty.length === 0) return from;
  const to = pick(empty, rng);
  state.holes[to] = state.holes[from];
  state.holes[from] = null;
  return to;
}

// Advance the shift by dtMs. Returns a new state; the input is not mutated.
// `rng` drives spawns and must be consumed the same way whatever the player does, so a seeded shift sends
// every player the same moles. Boss hops depend on the player, so they draw from `hopRng`.
export function tick(prev: ShiftState, dtMs: number, cfg: ShiftConfig, rng: () => number, hopRng: () => number = rng): Step {
  if (prev.result) return { state: prev, events: [] };
  const events: ShiftEvent[] = [];
  const state: ShiftState = { ...prev, holes: prev.holes.map((m) => (m ? { ...m, ageMs: m.ageMs + dtMs } : null)) };

  state.holes.forEach((mole, hole) => {
    if (mole && mole.ageMs >= mole.upMs) escape(state, hole, events);
  });

  const bossAt = state.holes.findIndex((m) => m && MOLES[m.kind].boss);
  const boss = state.holes[bossAt];
  if (boss && boss.hopInMs !== undefined) {
    boss.hopInMs -= dtMs;
    if (boss.hopInMs <= 0) {
      boss.hopInMs += MOLES[boss.kind].hopEveryMs ?? Infinity;
      const to = hop(state, bossAt, hopRng);
      if (to !== bossAt) events.push({ type: 'bossHop', hole: bossAt, to, kind: boss.kind });
    }
  }

  state.timeLeftMs = Math.max(0, state.timeLeftMs - dtMs);

  if (!state.bossSpawned && state.timeLeftMs > 0 && state.timeLeftMs <= cfg.bossAtMs) {
    state.bossSpawned = true;
    const empty = emptyHoles(state);
    const hole = pick(empty.length ? empty : state.holes.map((_, i) => i), rng); // full board: the boss shoves someone out. Always one roll.
    const def = MOLES[cfg.boss];
    state.holes[hole] = { kind: cfg.boss, ageMs: 0, upMs: Infinity, hp: cfg.bossHp, hopInMs: def.hopEveryMs };
    events.push({ type: 'spawn', hole, kind: cfg.boss });
  }

  state.spawnInMs -= dtMs;
  while (state.spawnInMs <= 0) {
    state.spawnInMs += cfg.spawnEveryMs;
    // Roll both dice even when the board is full: see the note on `rng` above.
    const where = rng();
    const kind = pickWeighted(cfg.moles, rng);
    const empty = emptyHoles(state);
    if (empty.length === 0) continue;
    const hole = empty[Math.floor(where * empty.length)];
    state.holes[hole] = { kind, ageMs: 0, upMs: MOLES[kind].upMs * cfg.upScale, hp: 1 };
    events.push({ type: 'spawn', hole, kind });
  }

  // The whistle: a boss still standing gets away.
  if (state.timeLeftMs <= 0) {
    state.holes.forEach((mole, hole) => {
      if (mole && MOLES[mole.kind].boss) escape(state, hole, events);
    });
  }
  return finish(state, events);
}

// Player bonks a hole. Empty holes do nothing. `rng` is the hop stream, never the spawn stream.
export function whack(prev: ShiftState, hole: number, cfg: ShiftConfig, rng: () => number): Step {
  if (prev.result || !prev.holes[hole]) return { state: prev, events: [] };
  const state: ShiftState = { ...prev, holes: prev.holes.map((m) => (m ? { ...m } : null)) };
  const mole = state.holes[hole]!;
  const def = MOLES[mole.kind];
  const events: ShiftEvent[] = [];

  if (mole.hp > 1) {
    mole.hp -= 1;
    const taken = cfg.bossHp - mole.hp;
    const hops = def.hopEveryHits !== undefined && taken % def.hopEveryHits === 0;
    const to = hops ? hop(state, hole, rng) : hole;
    events.push({ type: 'bossHit', hole, to, kind: mole.kind, hpLeft: mole.hp });
    return finish(state, events);
  }

  state.holes[hole] = null;
  if (def.hitCostsLife) {
    const shielded = state.decoyShields > 0;
    if (shielded) state.decoyShields -= 1;
    else state.lives -= 1;
    events.push({ type: 'decoy', hole, kind: mole.kind, lifeLost: !shielded });
  } else {
    const gold = Math.round(def.gold * cfg.goldMult);
    state.gold += gold;
    state.hits += 1;
    events.push({ type: 'hit', hole, kind: mole.kind, gold });
  }
  return finish(state, events);
}

// Rewarded revive: a sacked shift carries on with one life, exactly where it stopped.
export function revive(state: ShiftState): ShiftState {
  return state.result === 'failed' ? { ...state, lives: 1, result: null } : state;
}
