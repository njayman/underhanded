import { describe, it, expect } from 'vitest';
import { UPGRADES } from '../src/data/upgrades';
import { MOLES } from '../src/data/moles';
import { bankShift, buyUpgrade, defaultSave, sanitizeSave, upgradeCost, upgradeMods, type Save } from '../src/meta/progression';
import { loadSave, writeSave } from '../src/meta/storage';
import { shiftConfigForDepth } from '../src/generation/depth';
import { applyMods, applyTools } from '../src/rules/tools';

const rich = (gold: number, upgrades: Record<string, number> = {}): Save => ({ ...defaultSave(), gold, upgrades });
const fakeStore = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe('upgrades', () => {
  it('cost grows per level and is null when maxed', () => {
    expect(upgradeCost(rich(0), 'bigger-pockets')).toBe(60);
    expect(upgradeCost(rich(0, { 'bigger-pockets': 1 }), 'bigger-pockets')).toBe(108);
    expect(upgradeCost(rich(0, { 'bigger-pockets': 5 }), 'bigger-pockets')).toBeNull();
  });
  it('buying deducts gold and raises the level, without mutating the input', () => {
    const before = rich(100);
    const after = buyUpgrade(before, 'bigger-pockets');
    expect(after).toMatchObject({ gold: 40, upgrades: { 'bigger-pockets': 1 } });
    expect(before).toMatchObject({ gold: 100, upgrades: {} });
  });
  it('cannot buy when short of gold, maxed, or unknown', () => {
    const poor = rich(59);
    expect(buyUpgrade(poor, 'bigger-pockets')).toBe(poor);
    const maxed = rich(99999, { 'padded-mallet': 1 });
    expect(buyUpgrade(maxed, 'padded-mallet')).toBe(maxed);
    expect(buyUpgrade(maxed, 'no-such-thing')).toBe(maxed);
  });
  it('gold never goes negative buying everything', () => {
    let save = rich(100000);
    for (let i = 0; i < 50; i++) for (const id of Object.keys(UPGRADES)) save = buyUpgrade(save, id);
    expect(save.gold).toBeGreaterThanOrEqual(0);
    for (const def of Object.values(UPGRADES)) expect(save.upgrades[def.id]).toBe(def.maxLevel);
  });
  it('levels feed the shift config and stack with tools', () => {
    const save = rich(0, { 'steel-toe-boots': 2, 'bigger-pockets': 2, 'padded-mallet': 1 });
    const cfg = applyTools(applyMods(shiftConfigForDepth(1), upgradeMods(save)), ['union-thermos', 'rubber-mallet']);
    expect(cfg.lives).toBe(3 + 2 + 1);
    expect(cfg.goldMult).toBeCloseTo(1.21);
    expect(cfg.decoyShields).toBe(2);
  });
  it('no upgrade changes shift length, and data references real moles', () => {
    const all = rich(0, Object.fromEntries(Object.values(UPGRADES).map((u) => [u.id, u.maxLevel])));
    expect(applyMods(shiftConfigForDepth(1), upgradeMods(all)).durationMs).toBe(60_000);
    for (const u of Object.values(UPGRADES)) for (const id of Object.keys(u.mods.weightMult ?? {})) expect(MOLES[id]).toBeDefined();
  });
});

describe('bankShift', () => {
  it('adds gold and tracks the deepest shift', () => {
    let save = bankShift(defaultSave(), 40, 3);
    expect(save).toMatchObject({ gold: 40, bestDepth: 3 });
    save = bankShift(save, 5, 1);
    expect(save).toMatchObject({ gold: 45, bestDepth: 3 });
  });
});

describe('sanitizeSave', () => {
  it('garbage becomes a clean save', () => {
    for (const junk of [null, undefined, 42, 'gold', [], { gold: 'lots' }, { gold: NaN, bestDepth: -4 }, { upgrades: 'x' }])
      expect(sanitizeSave(junk)).toEqual(defaultSave());
  });
  it('clamps levels, drops unknown upgrades, floors fractions', () => {
    const save = sanitizeSave({ gold: 12.9, bestDepth: 7, upgrades: { 'padded-mallet': 99, 'made-up': 3, 'strong-tea': -1, 'bigger-pockets': 2.7 } });
    expect(save).toEqual({ ...defaultSave(), gold: 12, bestDepth: 7, upgrades: { 'padded-mallet': 1, 'bigger-pockets': 2 } });
  });
});

describe('storage', () => {
  it('round-trips a save', () => {
    const store = fakeStore();
    const save = rich(321, { 'strong-tea': 2 });
    expect(writeSave(save, store)).toBe(true);
    expect(loadSave(store)).toEqual(save);
  });
  it('empty, corrupt, or throwing storage loads a clean save', () => {
    expect(loadSave(fakeStore())).toEqual(defaultSave());
    expect(loadSave(fakeStore({ 'underhanded.save.v1': '{not json' }))).toEqual(defaultSave());
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(loadSave(broken)).toEqual(defaultSave());
    expect(writeSave(defaultSave(), broken)).toBe(false);
  });
});
