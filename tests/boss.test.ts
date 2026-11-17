import { describe, it, expect } from 'vitest';
import { LAYERS } from '../src/data/layers';
import { MOLES } from '../src/data/moles';
import { shiftConfigForDepth, type ShiftConfig } from '../src/generation/depth';
import { createShift, tick, whack, type ShiftEvent, type ShiftState } from '../src/rules/shift';
import { applyTools } from '../src/rules/tools';
import { mulberry32 } from '../src/rules/rng';

const quiet = { spawnInMs: 1e9 };
const bossHole = (s: ShiftState) => s.holes.findIndex((m) => m && MOLES[m.kind].boss);

// Run a quiet shift up to just after the boss arrives.
function toBoss(cfg: ShiftConfig, seed = 1) {
  const rng = mulberry32(seed);
  const step = tick({ ...createShift(cfg), ...quiet }, cfg.durationMs - cfg.bossAtMs, cfg, rng);
  return { rng, state: step.state, events: step.events };
}
function bonkBoss(state: ShiftState, cfg: ShiftConfig, rng: () => number, times: number) {
  const events: ShiftEvent[] = [];
  for (let i = 0; i < times; i++) {
    const step = whack(state, bossHole(state), cfg, rng);
    state = step.state;
    events.push(...step.events);
  }
  return { state, events };
}

describe('boss data', () => {
  it('every layer has a defined boss that never spawns as an ordinary mole', () => {
    for (const layer of LAYERS) {
      expect(MOLES[layer.boss]?.boss).toBe(true);
      expect(MOLES[layer.boss].name).toBeTruthy();
      for (const id of Object.keys(layer.moles)) expect(MOLES[id].boss).toBeUndefined();
    }
  });
  it('boss hp grows each time a layer comes round again, then stops', () => {
    const n = LAYERS.length;
    expect(shiftConfigForDepth(1 + n).bossHp).toBe(shiftConfigForDepth(1).bossHp + 2);
    expect(shiftConfigForDepth(1 + n * 4).bossHp).toBe(shiftConfigForDepth(1 + n * 400).bossHp);
  });
});

describe('boss in a shift', () => {
  const cfg = shiftConfigForDepth(1); // The Archivist: stays put

  it('arrives once, when bossAtMs is left', () => {
    const rng = mulberry32(2);
    let state: ShiftState = { ...createShift(cfg), ...quiet };
    const spawns: number[] = [];
    while (!state.result) {
      const step = tick(state, 100, cfg, rng);
      for (const e of step.events) if (e.type === 'spawn') spawns.push(step.state.timeLeftMs);
      state = step.state;
    }
    expect(spawns).toEqual([cfg.bossAtMs]);
  });
  it('takes bossHp bonks, pays out on the last one, and costs nothing at the whistle', () => {
    const start = toBoss(cfg);
    expect(start.state.holes[bossHole(start.state)]!.hp).toBe(cfg.bossHp);
    const almost = bonkBoss(start.state, cfg, start.rng, cfg.bossHp - 1);
    expect(almost.state.gold).toBe(0);
    expect(bossHole(almost.state)).toBeGreaterThanOrEqual(0);
    const done = bonkBoss(almost.state, cfg, start.rng, 1);
    expect(done.events.at(-1)).toMatchObject({ type: 'hit', kind: cfg.boss, gold: MOLES[cfg.boss].gold });
    expect(bossHole(done.state)).toBe(-1);
    const end = tick(done.state, cfg.bossAtMs, cfg, start.rng).state;
    expect(end).toMatchObject({ result: 'cleared', lives: 3, gold: MOLES[cfg.boss].gold });
  });
  it('a boss left standing at the whistle costs a life', () => {
    const start = toBoss(cfg);
    const end = tick(start.state, cfg.bossAtMs, cfg, start.rng);
    expect(end.state).toMatchObject({ result: 'cleared', lives: 2 });
    expect(end.events).toContainEqual({ type: 'escaped', hole: bossHole(start.state), kind: cfg.boss, lifeLost: true, shielded: false });
  });
  it('...and sacks you if it was your last life', () => {
    const start = toBoss(cfg);
    expect(tick({ ...start.state, lives: 1 }, cfg.bossAtMs, cfg, start.rng).state.result).toBe('failed');
  });
  it('still costs the life when frame times do not sum exactly', () => {
    const rng = mulberry32(4);
    let state: ShiftState = { ...createShift(cfg), ...quiet };
    while (!state.result) state = tick(state, 16.6667, cfg, rng).state;
    expect(state).toMatchObject({ result: 'cleared', lives: 2 });
  });
  it('Butterfly Net does not forgive a boss', () => {
    const netted = applyTools(cfg, ['butterfly-net']);
    const start = toBoss(netted);
    const end = tick(start.state, netted.bossAtMs, netted, start.rng).state;
    expect(end).toMatchObject({ lives: 2, goldenShields: 1 });
  });
  it('Gold Pan multiplies the boss payout', () => {
    const rich = applyTools(cfg, ['gold-pan']);
    const start = toBoss(rich);
    expect(bonkBoss(start.state, rich, start.rng, rich.bossHp).state.gold).toBe(Math.round(MOLES[rich.boss].gold * 1.5));
  });
  it('whack does not mutate the boss in the input state', () => {
    const start = toBoss(cfg);
    whack(start.state, bossHole(start.state), cfg, start.rng);
    expect(start.state.holes[bossHole(start.state)]!.hp).toBe(cfg.bossHp);
  });
});

describe('hopping bosses', () => {
  it('The Pipe Inspector moves after every second bonk', () => {
    const cfg = shiftConfigForDepth(2);
    const start = toBoss(cfg);
    const first = bonkBoss(start.state, cfg, start.rng, 1);
    expect(bossHole(first.state)).toBe(bossHole(start.state));
    const second = bonkBoss(first.state, cfg, start.rng, 1);
    expect(bossHole(second.state)).not.toBe(bossHole(start.state));
    expect(second.events[0]).toMatchObject({ type: 'bossHit', hole: bossHole(start.state), to: bossHole(second.state) });
  });
  it('The Treasurer moves after every bonk and can still be beaten', () => {
    const cfg = shiftConfigForDepth(3);
    const start = toBoss(cfg);
    const one = bonkBoss(start.state, cfg, start.rng, 1);
    expect(bossHole(one.state)).not.toBe(bossHole(start.state));
    expect(bossHole(bonkBoss(one.state, cfg, start.rng, cfg.bossHp - 1).state)).toBe(-1);
  });
  it('The Diva moves on a timer, keeping her hp', () => {
    const cfg = shiftConfigForDepth(4);
    const start = toBoss(cfg);
    const hit = bonkBoss(start.state, cfg, start.rng, 3).state;
    expect(bossHole(hit)).toBe(bossHole(start.state)); // bonks do not move her
    const step = tick(hit, MOLES.diva.hopEveryMs!, cfg, start.rng);
    expect(step.events.some((e) => e.type === 'bossHop')).toBe(true);
    expect(bossHole(step.state)).not.toBe(bossHole(hit));
    expect(step.state.holes[bossHole(step.state)]!.hp).toBe(cfg.bossHp - 3);
  });
  it('a hopping boss never lands on another mole', () => {
    const cfg = shiftConfigForDepth(3);
    const rng = mulberry32(8);
    let state = createShift(cfg); // spawns on: busy board
    while (!state.result) {
      state = tick(state, 50, cfg, rng).state;
      const at = bossHole(state);
      if (at < 0) continue;
      const before = state.holes.filter(Boolean).length;
      state = whack(state, at, cfg, rng).state;
      const after = state.holes.filter(Boolean).length;
      expect(before - after).toBeLessThanOrEqual(1); // only the boss itself can vanish
    }
  });
});
