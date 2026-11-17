import { describe, it, expect } from 'vitest';
import { TOOLS } from '../src/data/tools';
import { MOLES } from '../src/data/moles';
import { shiftConfigForDepth } from '../src/generation/depth';
import { applyTools, draftOffer } from '../src/rules/tools';
import { createShift, tick, whack } from '../src/rules/shift';
import { mulberry32 } from '../src/rules/rng';

const rng0 = mulberry32(1);

const base = shiftConfigForDepth(1);
const quiet = { spawnInMs: 1e9 };
const mole = (kind: string) => ({ kind, ageMs: 0, upMs: 1000, hp: 1, maxHp: 1, hits: 0 });

describe('applyTools', () => {
  it('no tools changes nothing and does not share the weights object', () => {
    const cfg = applyTools(base, []);
    expect(cfg).toEqual(base);
    expect(cfg.moles).not.toBe(base.moles);
  });
  it('adds and multiplies, and stacks repeats', () => {
    const cfg = applyTools(base, ['union-thermos', 'union-thermos', 'gold-pan', 'gold-pan', 'lucky-ledger']);
    expect(cfg.lives).toBe(base.lives + 2);
    expect(cfg.goldMult).toBeCloseTo(2.25);
    expect(cfg.moles.golden).toBe(base.moles.golden * 2);
    expect(base.moles.golden).toBe(1); // base untouched
  });
  it('no tool changes shift length (leaderboard caps depth by elapsed time)', () => {
    const all = Object.values(TOOLS).flatMap((t) => Array<string>(t.maxStacks).fill(t.id));
    expect(applyTools(base, all).durationMs).toBe(base.durationMs);
  });
  it('tool data only references defined moles', () => {
    for (const t of Object.values(TOOLS)) for (const id of Object.keys(t.mods.weightMult ?? {})) expect(MOLES[id]).toBeDefined();
  });
});

describe('tool effects in a shift', () => {
  it('Rubber Mallet forgives one foreman bonk per shift, then lives drop again', () => {
    const cfg = applyTools(base, ['rubber-mallet']);
    let s = { ...createShift(cfg), ...quiet };
    s.holes[0] = mole('foreman');
    let step = whack(s, 0, cfg, rng0);
    expect(step.state.lives).toBe(3);
    expect(step.events[0]).toMatchObject({ type: 'decoy', lifeLost: false });
    s = step.state;
    s.holes[1] = mole('foreman');
    step = whack(s, 1, cfg, rng0);
    expect(step.state.lives).toBe(2);
    expect(createShift(cfg).decoyShields).toBe(1); // refills next shift
  });
  it('Butterfly Net forgives one escaped golden mole per shift', () => {
    const cfg = applyTools(base, ['butterfly-net']);
    let s = { ...createShift(cfg), ...quiet };
    s.holes[0] = mole('golden');
    let step = tick(s, 1000, cfg, mulberry32(1));
    expect(step.state.lives).toBe(3);
    expect(step.events[0]).toMatchObject({ type: 'escaped', lifeLost: false, shielded: true });
    s = step.state;
    s.holes[0] = mole('golden');
    step = tick(s, 1000, cfg, mulberry32(1));
    expect(step.state.lives).toBe(2);
  });
  it('Gold Pan multiplies gold per bonk', () => {
    const cfg = applyTools(base, ['gold-pan', 'gold-pan']);
    const s = createShift(cfg);
    s.holes[0] = mole('golden');
    expect(whack(s, 0, cfg, rng0).state.gold).toBe(Math.round(5 * 2.25));
  });
  it('Union Thermos gives the extra life at shift start', () => {
    expect(createShift(applyTools(base, ['union-thermos'])).lives).toBe(4);
  });
});

describe('draftOffer', () => {
  it('offers three distinct known tools', () => {
    const offer = draftOffer([], mulberry32(5));
    expect(offer).toHaveLength(3);
    expect(new Set(offer).size).toBe(3);
    for (const id of offer) expect(TOOLS[id]).toBeDefined();
  });
  it('same seed gives the same offer', () => {
    expect(draftOffer([], mulberry32(9))).toEqual(draftOffer([], mulberry32(9)));
  });
  it('different seeds eventually differ', () => {
    const offers = new Set(Array.from({ length: 20 }, (_, i) => draftOffer([], mulberry32(i)).join()));
    expect(offers.size).toBeGreaterThan(1);
  });
  it('never offers a tool already at max stacks', () => {
    const owned = ['lucky-ledger', 'day-off', 'gold-pan', 'gold-pan', 'gold-pan'];
    for (let seed = 0; seed < 50; seed++) {
      const offer = draftOffer(owned, mulberry32(seed));
      expect(offer).not.toContain('lucky-ledger');
      expect(offer).not.toContain('day-off');
      expect(offer).not.toContain('gold-pan');
    }
  });
  it('shrinks to what is left, down to nothing', () => {
    const all = Object.values(TOOLS).flatMap((t) => Array<string>(t.maxStacks).fill(t.id));
    expect(draftOffer(all, mulberry32(1))).toEqual([]);
    const allButOne = all.filter((id) => id !== 'day-off');
    expect(draftOffer(allButOne, mulberry32(1))).toEqual(['day-off']);
  });
});
