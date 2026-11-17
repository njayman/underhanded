import { describe, it, expect } from 'vitest';
import { shiftConfigForDepth } from '../src/generation/depth';
import { createShift, tick, whack, type ShiftState, type ShiftEvent } from '../src/rules/shift';
import { mulberry32 } from '../src/rules/rng';

const rng0 = mulberry32(1);
const cfg = shiftConfigForDepth(1); // depth 1: no boss
const withMole = (kind: string, over: Partial<ShiftState> = {}, hp = 1): ShiftState => {
  const s = createShift(cfg);
  s.holes[4] = { kind, ageMs: 0, upMs: 1000, hp, maxHp: hp, hits: 0 };
  return { ...s, ...over };
};

describe('whack', () => {
  it('finishing a clerk earns gold and keeps lives', () => {
    const { state, events } = whack(withMole('clerk'), 4, cfg, rng0);
    expect(state).toMatchObject({ gold: 1, kills: 1, lives: 3, combo: 1 });
    expect(state.holes[4]).toBeNull();
    expect(events.at(-1)).toMatchObject({ type: 'hit', kind: 'clerk', cause: 'hammer' });
  });
  it('a clerk at full hp needs two mallet hits', () => {
    let state = withMole('clerk', {}, 2);
    let step = whack(state, 4, cfg, rng0);
    expect(step.events).toEqual([{ type: 'hurt', hole: 4, to: 4, kind: 'clerk', hpLeft: 1, damage: 1 }]);
    state = step.state;
    step = whack(state, 4, cfg, rng0);
    expect(step.state.holes[4]).toBeNull();
    expect(step.state.combo).toBe(2);
  });
  it('hammer damage kills in one hit when big enough', () => {
    const { state } = whack(withMole('clerk', {}, 3), 4, { ...cfg, damage: 3 }, rng0);
    expect(state.holes[4]).toBeNull();
  });
  it('hitting a foreman (decoy) costs a life and no gold', () => {
    const { state } = whack(withMole('foreman'), 4, cfg, rng0);
    expect(state).toMatchObject({ gold: 0, kills: 0, lives: 2 });
  });
  it('losing the last life fails the shift', () => {
    const { state, events } = whack(withMole('foreman', { lives: 1 }), 4, cfg, rng0);
    expect(state.result).toBe('failed');
    expect(events.at(-1)).toEqual({ type: 'over', result: 'failed' });
  });
  it('an empty hole is a whiff; a finished shift ignores taps', () => {
    const s = createShift(cfg);
    expect(whack(s, 0, cfg, rng0).events).toEqual([{ type: 'whiff', hole: 0 }]);
    const done = withMole('clerk', { result: 'cleared' });
    expect(whack(done, 4, cfg, rng0).state).toBe(done);
  });
  it('does not mutate the input state', () => {
    const s = withMole('clerk', {}, 2);
    whack(s, 4, cfg, rng0);
    expect(s.holes[4]!.hp).toBe(2);
    expect(s.combo).toBe(0);
  });
});

describe('tick', () => {
  const quiet = { spawnInMs: 1e9 }; // no spawns, isolate the rule under test
  it('a missed golden mole costs a life', () => {
    const { state, events } = tick(withMole('golden', quiet), 1000, cfg, mulberry32(1));
    expect(state.lives).toBe(2);
    expect(events).toContainEqual({ type: 'escaped', hole: 4, kind: 'golden', lifeLost: true, shielded: false });
  });
  it('a missed clerk or foreman costs nothing', () => {
    for (const kind of ['clerk', 'foreman']) {
      const { state } = tick(withMole(kind, quiet), 1000, cfg, mulberry32(1));
      expect(state.lives).toBe(3);
      expect(state.holes[4]).toBeNull();
    }
  });
  it('surviving the full duration clears the shift', () => {
    const { state } = tick({ ...createShift(cfg), ...quiet }, cfg.durationMs, cfg, mulberry32(1));
    expect(state.result).toBe('cleared');
  });
  it('zero lives beats the timer: failed, not cleared', () => {
    const s = withMole('golden', { ...quiet, lives: 1, timeLeftMs: 500 });
    expect(tick(s, 1000, cfg, mulberry32(1)).state.result).toBe('failed');
  });
  it('spawned moles get depth-scaled hp', () => {
    const deep = shiftConfigForDepth(21);
    let state = createShift(deep);
    const rng = mulberry32(5);
    while (!state.holes.some(Boolean)) state = tick(state, 50, deep, rng).state;
    const mole = state.holes.find(Boolean)!;
    expect(mole.hp).toBe(mole.maxHp);
    expect(mole.hp).toBeGreaterThan(1);
  });
  it('same seed gives the same spawn layout', () => {
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      let state = createShift(cfg);
      const spawns: ShiftEvent[] = [];
      for (let i = 0; i < 600; i++) {
        const step = tick(state, 16, cfg, rng);
        state = step.state;
        spawns.push(...step.events.filter((e) => e.type === 'spawn'));
      }
      return spawns;
    };
    expect(run(20261116).length).toBeGreaterThan(5);
    expect(run(20261116)).toEqual(run(20261116));
    expect(run(20261116)).not.toEqual(run(20261117));
  });
  it('never spawns into an occupied hole', () => {
    const rng = mulberry32(3);
    let state = createShift(cfg);
    for (let i = 0; i < 2000; i++) {
      const before = state.holes;
      const step = tick(state, 16, cfg, rng);
      for (const e of step.events) if (e.type === 'spawn') expect(before[e.hole]).toBeNull();
      state = step.state;
    }
  });
});
