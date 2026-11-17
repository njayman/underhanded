import { ABILITY, METER_MAX, type AbilityId } from '../data/abilities';
import { MOLES } from '../data/moles';
import { moleHp, type ShiftConfig } from '../generation/depth';

export interface ActiveMole {
  kind: string;
  ageMs: number;
  upMs: number;
  hp: number;
  maxHp: number;
  hits: number; // hits taken, for bosses that hop every N hits
  hopInMs?: number; // bosses that hop on a timer
}

export type ShiftResult = 'cleared' | 'failed';

export interface ShiftState {
  timeLeftMs: number;
  lives: number;
  gold: number;
  kills: number;
  holes: (ActiveMole | null)[];
  traps: boolean[]; // a set trap per hole
  spawnInMs: number;
  decoyShields: number; // remaining this shift
  goldenShields: number;
  hardHats: number; // remaining this shift; the scene charges the save for each one used
  combo: number; // hits in a row; drives the gold multiplier
  bestCombo: number;
  meter: number; // ability charge, 0..METER_MAX
  frozenMs: number; // Cold Snap: moles do not age, nobody escapes
  frenzyMs: number; // Frenzy: double damage
  bossSpawned: boolean;
  result: ShiftResult | null;
}

export type ShiftEvent =
  | { type: 'spawn'; hole: number; kind: string }
  | { type: 'hurt'; hole: number; to: number; kind: string; hpLeft: number; damage: number } // `to` differs from `hole` if it hopped
  | { type: 'hit'; hole: number; kind: string; gold: number; cause: 'hammer' | 'quake' | 'trap' } // finished off
  | { type: 'bossHop'; hole: number; to: number; kind: string }
  | { type: 'decoy'; hole: number; kind: string; lifeLost: boolean } // lifeLost false: a shield took it
  | { type: 'escaped'; hole: number; kind: string; lifeLost: boolean; shielded: boolean }
  | { type: 'whiff'; hole: number }
  | { type: 'comboBreak'; combo: number }
  | { type: 'meterFull' }
  | { type: 'hardHat' } // a bought hard hat absorbed a lost life
  | { type: 'ability'; id: AbilityId; hole?: number }
  | { type: 'trapped'; hole: number; kind: string } // a trap caught a foreman: no harm done
  | { type: 'over'; result: ShiftResult };

export interface Step {
  state: ShiftState;
  events: ShiftEvent[];
}

export const FRENZY_MULT = 2;

// Gold multiplier from the combo: +20% per 10 hits in a row, up to double.
export const comboMult = (combo: number): number => 1 + Math.min(Math.floor(combo / 10), 5) * 0.2;

export function createShift(cfg: ShiftConfig): ShiftState {
  return {
    timeLeftMs: cfg.durationMs,
    lives: cfg.lives,
    gold: 0,
    kills: 0,
    holes: Array.from({ length: cfg.holes }, () => null),
    traps: Array.from({ length: cfg.holes }, () => false),
    spawnInMs: cfg.spawnEveryMs,
    decoyShields: cfg.decoyShields,
    goldenShields: cfg.goldenShields,
    hardHats: cfg.hardHats,
    combo: 0,
    bestCombo: 0,
    meter: 0,
    frozenMs: 0,
    frenzyMs: 0,
    bossSpawned: false,
    result: null,
  };
}

const copy = (s: ShiftState): ShiftState => ({ ...s, holes: s.holes.map((m) => (m ? { ...m } : null)), traps: s.traps.slice() });

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

// A life is lost unless a bought hard hat takes it.
function loseLife(state: ShiftState, events: ShiftEvent[]): boolean {
  if (state.hardHats > 0) {
    state.hardHats -= 1;
    events.push({ type: 'hardHat' });
    return false;
  }
  state.lives -= 1;
  return true;
}

function breakCombo(state: ShiftState, events: ShiftEvent[]): void {
  if (state.combo === 0 && state.meter === 0) return;
  events.push({ type: 'comboBreak', combo: state.combo });
  state.combo = 0;
  state.meter = 0;
}

// A damaging hammer hit: grows the combo and charges the meter.
function landHit(state: ShiftState, cfg: ShiftConfig, events: ShiftEvent[]): void {
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const before = state.meter;
  state.meter = Math.min(METER_MAX, state.meter + cfg.meterGain);
  if (before < METER_MAX && state.meter >= METER_MAX) events.push({ type: 'meterFull' });
}

// Remove a finished mole and pay out.
function kill(state: ShiftState, hole: number, cfg: ShiftConfig, cause: 'hammer' | 'quake' | 'trap', events: ShiftEvent[]): void {
  const mole = state.holes[hole]!;
  state.holes[hole] = null;
  const gold = Math.round(MOLES[mole.kind].gold * cfg.goldMult * comboMult(state.combo));
  state.gold += gold;
  state.kills += 1;
  events.push({ type: 'hit', hole, kind: mole.kind, gold, cause });
}

// A mole leaves unbonked. Tool shields forgive golden moles, never bosses; hard hats take anything.
function escape(state: ShiftState, hole: number, events: ShiftEvent[]): void {
  const mole = state.holes[hole]!;
  const def = MOLES[mole.kind];
  state.holes[hole] = null;
  if (!def.missCostsLife) return void events.push({ type: 'escaped', hole, kind: mole.kind, lifeLost: false, shielded: false });
  const shielded = !def.boss && state.goldenShields > 0;
  if (shielded) state.goldenShields -= 1;
  const lifeLost = !shielded && loseLife(state, events);
  events.push({ type: 'escaped', hole, kind: mole.kind, lifeLost, shielded });
  breakCombo(state, events);
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

// A mole appears. A trap on the hole snaps it at once: foremen are carried off harmlessly.
function place(state: ShiftState, hole: number, mole: ActiveMole, cfg: ShiftConfig, events: ShiftEvent[]): void {
  state.holes[hole] = mole;
  events.push({ type: 'spawn', hole, kind: mole.kind });
  if (state.traps[hole]) springTrap(state, hole, cfg, events);
}

function springTrap(state: ShiftState, hole: number, cfg: ShiftConfig, events: ShiftEvent[]): void {
  const mole = state.holes[hole]!;
  state.traps[hole] = false;
  if (MOLES[mole.kind].hitCostsLife) {
    state.holes[hole] = null;
    return void events.push({ type: 'trapped', hole, kind: mole.kind });
  }
  const damage = ABILITY.trap.power[Math.max(1, cfg.abilities.trap) - 1];
  mole.hp -= damage;
  if (mole.hp <= 0) kill(state, hole, cfg, 'trap', events);
  else events.push({ type: 'hurt', hole, to: hole, kind: mole.kind, hpLeft: mole.hp, damage });
}

// Advance the shift by dtMs. Returns a new state; the input is not mutated.
// `rng` drives spawns and must be consumed the same way whatever the player does, so a seeded shift sends
// every player the same moles. Anything that depends on the player (boss hops) draws from `hopRng`.
export function tick(prev: ShiftState, dtMs: number, cfg: ShiftConfig, rng: () => number, hopRng: () => number = rng): Step {
  if (prev.result) return { state: prev, events: [] };
  const events: ShiftEvent[] = [];
  const state = copy(prev);
  const frozen = state.frozenMs > 0;
  state.frozenMs = Math.max(0, state.frozenMs - dtMs);
  state.frenzyMs = Math.max(0, state.frenzyMs - dtMs);

  if (!frozen) {
    state.holes.forEach((mole, hole) => {
      if (!mole) return;
      mole.ageMs += dtMs;
      if (mole.ageMs >= mole.upMs) escape(state, hole, events);
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
  }

  state.timeLeftMs = Math.max(0, state.timeLeftMs - dtMs);

  if (cfg.boss && !state.bossSpawned && state.timeLeftMs > 0 && state.timeLeftMs <= cfg.bossAtMs) {
    state.bossSpawned = true;
    const empty = emptyHoles(state);
    const hole = pick(empty.length ? empty : state.holes.map((_, i) => i), rng); // full board: the boss shoves someone out. Always one roll.
    const def = MOLES[cfg.boss];
    place(state, hole, { kind: cfg.boss, ageMs: 0, upMs: Infinity, hp: cfg.bossHp, maxHp: cfg.bossHp, hits: 0, hopInMs: def.hopEveryMs }, cfg, events);
  }

  state.spawnInMs -= dtMs;
  while (state.spawnInMs <= 0) {
    state.spawnInMs += cfg.spawnEveryMs;
    // Roll both dice even when the board is full: see the note on `rng` above.
    const where = rng();
    const kind = pickWeighted(cfg.moles, rng);
    const empty = emptyHoles(state);
    if (empty.length === 0) continue;
    const hp = moleHp(kind, cfg);
    place(state, empty[Math.floor(where * empty.length)], { kind, ageMs: 0, upMs: MOLES[kind].upMs * cfg.upScale, hp, maxHp: hp, hits: 0 }, cfg, events);
  }

  // The whistle: a boss still standing gets away.
  if (state.timeLeftMs <= 0) {
    state.holes.forEach((mole, hole) => {
      if (mole && MOLES[mole.kind].boss) escape(state, hole, events);
    });
  }
  return finish(state, events);
}

// Player taps a hole. An empty hole is a whiff and breaks the combo. `rng` is the hop stream.
export function whack(prev: ShiftState, hole: number, cfg: ShiftConfig, rng: () => number): Step {
  if (prev.result) return { state: prev, events: [] };
  const state = copy(prev);
  const events: ShiftEvent[] = [];
  const mole = state.holes[hole];
  if (!mole) {
    events.push({ type: 'whiff', hole });
    breakCombo(state, events);
    return { state, events };
  }
  const def = MOLES[mole.kind];
  if (def.hitCostsLife) {
    state.holes[hole] = null;
    const shielded = state.decoyShields > 0;
    if (shielded) state.decoyShields -= 1;
    const lifeLost = !shielded && loseLife(state, events);
    events.push({ type: 'decoy', hole, kind: mole.kind, lifeLost });
    breakCombo(state, events);
    return finish(state, events);
  }
  const damage = cfg.damage * (state.frenzyMs > 0 ? FRENZY_MULT : 1);
  mole.hp -= damage;
  mole.hits += 1;
  landHit(state, cfg, events);
  if (mole.hp <= 0) {
    kill(state, hole, cfg, 'hammer', events);
    return finish(state, events);
  }
  const hops = def.hopEveryHits !== undefined && mole.hits % def.hopEveryHits === 0;
  const to = hops ? hop(state, hole, rng) : hole;
  events.push({ type: 'hurt', hole, to, kind: mole.kind, hpLeft: mole.hp, damage });
  return finish(state, events);
}

export function canUse(state: ShiftState, id: AbilityId, cfg: ShiftConfig): boolean {
  return !state.result && cfg.abilities[id] > 0 && state.meter >= ABILITY[id].charge;
}

// Fire an ability, spending meter. Trap needs a hole. Returns the state unchanged if it cannot fire.
export function useAbility(prev: ShiftState, id: AbilityId, cfg: ShiftConfig, hole?: number): Step {
  if (!canUse(prev, id, cfg) || (id === 'trap' && (hole === undefined || prev.traps[hole]))) return { state: prev, events: [] };
  const state = copy(prev);
  const events: ShiftEvent[] = [];
  const power = ABILITY[id].power[cfg.abilities[id] - 1];
  state.meter -= ABILITY[id].charge;
  events.push({ type: 'ability', id, hole });
  if (id === 'quake') {
    state.holes.forEach((mole, i) => {
      if (!mole || MOLES[mole.kind].hitCostsLife) return; // quakes spare the foremen: no penalty either
      const damage = power * (state.frenzyMs > 0 ? FRENZY_MULT : 1);
      mole.hp -= damage;
      if (mole.hp <= 0) kill(state, i, cfg, 'quake', events);
      else events.push({ type: 'hurt', hole: i, to: i, kind: mole.kind, hpLeft: mole.hp, damage });
    });
  } else if (id === 'trap') {
    state.traps[hole!] = true;
    if (state.holes[hole!]) springTrap(state, hole!, cfg, events); // set on a mole: snaps at once
  } else if (id === 'freeze') {
    state.frozenMs = Math.max(state.frozenMs, power);
  } else {
    state.frenzyMs = Math.max(state.frenzyMs, power);
  }
  return finish(state, events);
}

// Rewarded revive: a sacked shift carries on with one life, exactly where it stopped.
export function revive(state: ShiftState): ShiftState {
  return state.result === 'failed' ? { ...state, lives: 1, result: null } : state;
}
