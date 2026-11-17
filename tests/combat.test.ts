import { describe, it, expect } from 'vitest';
import { ABILITY, METER_MAX } from '../src/data/abilities';
import { shiftConfigForDepth, type ShiftConfig } from '../src/generation/depth';
import { canUse, comboMult, createShift, tick, useAbility, whack, type ShiftState } from '../src/rules/shift';
import { mulberry32 } from '../src/rules/rng';

const rng0 = mulberry32(1);
const cfg: ShiftConfig = { ...shiftConfigForDepth(1), abilities: { quake: 1, trap: 1, freeze: 1, frenzy: 1 } };
const quiet = { spawnInMs: 1e9 };
const put = (s: ShiftState, hole: number, kind: string, hp = 1) => {
  s.holes[hole] = { kind, ageMs: 0, upMs: 1000, hp, maxHp: hp, hits: 0 };
  return s;
};
const fresh = (over: Partial<ShiftState> = {}) => ({ ...createShift(cfg), ...quiet, ...over });

describe('combo and meter', () => {
  it('every damaging hit grows the combo and charges the meter', () => {
    let s = put(fresh(), 0, 'clerk', 3);
    s = whack(s, 0, cfg, rng0).state;
    s = whack(s, 0, cfg, rng0).state;
    expect(s).toMatchObject({ combo: 2, bestCombo: 2, meter: 2 });
  });
  it('the meter caps at METER_MAX and announces when it fills', () => {
    let s = put(fresh({ meter: METER_MAX - 1 }), 0, 'clerk', 5);
    const step = whack(s, 0, cfg, rng0);
    expect(step.state.meter).toBe(METER_MAX);
    expect(step.events).toContainEqual({ type: 'meterFull' });
    s = whack(step.state, 0, cfg, rng0).state;
    expect(s.meter).toBe(METER_MAX);
  });
  it('a whiff, a foreman hit, and a lost golden each break combo and meter', () => {
    const hot = { combo: 12, meter: 9 };
    const whiff = whack(fresh(hot), 3, cfg, rng0);
    expect(whiff.state).toMatchObject({ combo: 0, meter: 0 });
    expect(whiff.events).toContainEqual({ type: 'comboBreak', combo: 12 });
    expect(whack(put(fresh(hot), 0, 'foreman'), 0, cfg, rng0).state).toMatchObject({ combo: 0, meter: 0 });
    expect(tick(put(fresh(hot), 0, 'golden'), 1000, cfg, rng0).state).toMatchObject({ combo: 0, meter: 0 });
  });
  it('an ordinary mole escaping does not break the combo', () => {
    expect(tick(put(fresh({ combo: 5, meter: 5 }), 0, 'clerk'), 2000, cfg, rng0).state).toMatchObject({ combo: 5, meter: 5 });
  });
  it('the combo multiplies gold: +20% per 10, up to double', () => {
    expect([0, 9, 10, 25, 50, 500].map(comboMult)).toEqual([1, 1, 1.2, 1.4, 2, 2]);
    const s = put(fresh({ combo: 29 }), 0, 'golden');
    expect(whack(s, 0, cfg, rng0).state.gold).toBe(Math.round(5 * 1.6)); // combo 30 when it lands
  });
  it('tools that boost meter gain apply', () => {
    const s = whack(put(fresh(), 0, 'clerk', 3), 0, { ...cfg, meterGain: 1.5 }, rng0).state;
    expect(s.meter).toBe(1.5);
  });
});

describe('abilities', () => {
  const charged = (over: Partial<ShiftState> = {}) => fresh({ meter: METER_MAX, ...over });
  it('cannot fire when locked or short of charge; nothing changes', () => {
    const locked = { ...cfg, abilities: { ...cfg.abilities, frenzy: 0 } };
    const s = charged();
    expect(canUse(s, 'frenzy', locked)).toBe(false);
    expect(useAbility(s, 'frenzy', locked).state).toBe(s);
    const poor = fresh({ meter: ABILITY.quake.charge - 1 });
    expect(useAbility(poor, 'quake', cfg).state).toBe(poor);
  });
  it('quake damages every mole but spares foremen, and spends its charge', () => {
    const s = charged();
    put(s, 0, 'clerk', 2);
    put(s, 1, 'auditor', 5);
    put(s, 2, 'foreman');
    const { state, events } = useAbility(s, 'quake', cfg);
    expect(state.meter).toBe(METER_MAX - ABILITY.quake.charge);
    expect(state.holes[0]).toBeNull(); // 2 damage at level 1 kills a fresh clerk
    expect(state.holes[1]!.hp).toBe(3);
    expect(state.holes[2]).not.toBeNull();
    expect(state.lives).toBe(3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', kind: 'clerk', cause: 'quake' }));
  });
  it('a trap on an empty hole snaps the next mole there; on a foreman it just carries it off', () => {
    let s = useAbility(charged(), 'trap', cfg, 4).state;
    expect(s.traps[4]).toBe(true);
    s = { ...s, spawnInMs: 1 };
    const rng = mulberry32(1);
    let caught = false;
    for (let i = 0; i < 400 && !caught; i++) {
      const step = tick({ ...s, spawnInMs: 1 }, 1, cfg, rng);
      const snap = step.events.find((e) => (e.type === 'hit' && e.cause === 'trap') || e.type === 'trapped' || (e.type === 'hurt' && e.hole === 4));
      if (snap) {
        caught = true;
        expect(step.state.traps[4]).toBe(false);
        expect(step.state.lives).toBe(3);
      }
      s = { ...step.state, holes: step.state.holes.map((m, h) => (h === 4 ? m : null)) }; // keep other holes free
    }
    expect(caught).toBe(true);
  });
  it('a trap set on an occupied hole snaps at once; only one trap per hole', () => {
    const s = put(charged(), 2, 'clerk', 2);
    const { state, events } = useAbility(s, 'trap', cfg, 2);
    expect(state.holes[2]).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ type: 'hit', cause: 'trap' }));
    const set = useAbility(charged(), 'trap', cfg, 5).state;
    expect(useAbility(set, 'trap', cfg, 5).state).toBe(set);
    expect(useAbility(charged(), 'trap', cfg).state.meter).toBe(METER_MAX); // no hole: nothing
  });
  it('freeze stops moles ageing, so nothing escapes until it thaws', () => {
    let s = put(useAbility(charged(), 'freeze', cfg).state, 0, 'golden');
    s = tick(s, ABILITY.freeze.power[0] - 10, cfg, rng0).state;
    expect(s.holes[0]).not.toBeNull();
    expect(s.lives).toBe(3);
    for (let t = 0; t < 2000; t += 16) s = tick(s, 16, cfg, rng0).state; // thawed: ages again and escapes
    expect(s.holes[0]).toBeNull();
    expect(s.lives).toBe(2);
  });
  it('frenzy doubles hammer damage while it lasts', () => {
    let s = put(useAbility(charged(), 'frenzy', cfg).state, 0, 'auditor', 5);
    s = whack(s, 0, cfg, rng0).state;
    expect(s.holes[0]!.hp).toBe(3);
    s = tick(s, ABILITY.frenzy.power[0], cfg, rng0).state; // frenzy over (the auditor wandered off meanwhile)
    s = whack(put(s, 0, 'auditor', 5), 0, cfg, rng0).state;
    expect(s.holes[0]!.hp).toBe(4);
  });
  it('higher levels are stronger', () => {
    const lv5 = { ...cfg, abilities: { ...cfg.abilities, quake: 5 } };
    const s = put(charged(), 0, 'auditor', 9);
    expect(useAbility(s, 'quake', lv5).state.holes[0]).toBeNull();
  });
});

describe('hard hats', () => {
  it('absorb lost lives first, any cause, then lives drop', () => {
    const hatted = { ...cfg, hardHats: 1 };
    let s = put({ ...createShift(hatted), ...quiet }, 0, 'foreman');
    let step = whack(s, 0, hatted, rng0);
    expect(step.state).toMatchObject({ lives: 3, hardHats: 0 });
    expect(step.events).toContainEqual({ type: 'hardHat' });
    expect(step.events).toContainEqual({ type: 'decoy', hole: 0, kind: 'foreman', lifeLost: false });
    s = put(step.state, 1, 'golden');
    step = tick(s, 1000, hatted, rng0);
    expect(step.state.lives).toBe(2);
  });
  it('tool shields are used before hard hats', () => {
    const both = { ...cfg, hardHats: 1, decoyShields: 1 };
    const s = whack(put({ ...createShift(both), ...quiet }, 0, 'foreman'), 0, both, rng0).state;
    expect(s).toMatchObject({ hardHats: 1, decoyShields: 0, lives: 3 });
  });
});
