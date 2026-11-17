import { describe, it, expect } from 'vitest';
import { ABILITY } from '../src/data/abilities';
import { HAMMER, HAMMERS } from '../src/data/hammers';
import { TIERS, TIER_XP, XP_SHIFT } from '../src/data/season';
import { PRODUCTS } from '../src/data/store';
import { shiftConfigForDepth } from '../src/generation/depth';
import { applyGear, hammerDamage, playerPower, HARD_HATS_PER_SHIFT } from '../src/meta/gear';
import { MAX_HARD_HATS, applyGrant, defaultSave, sanitizeSave, type Save } from '../src/meta/progression';
import { addSeasonXp, claimTier, currentSeason, grantProduct, seasonEnds, seasonOf, tierReached } from '../src/meta/season';
import { HARD_HAT_COST, abilityCost, buyAbility, buyHammer, buyHardHat, equipHammer, equipSkin } from '../src/meta/shop';

const rich = (gold = 100_000): Save => ({ ...defaultSave(), gold });
const NOW = new Date('2026-11-17T12:00:00Z');

describe('hammers', () => {
  it('start with the mallet equipped; buying equips and deducts', () => {
    expect(defaultSave()).toMatchObject({ hammers: ['mallet'], hammer: 'mallet' });
    const s = buyHammer(rich(400), 'claw');
    expect(s).toMatchObject({ gold: 400 - HAMMER.claw.cost, hammer: 'claw', hammers: ['mallet', 'claw'] });
    expect(hammerDamage(s)).toBe(2);
  });
  it('cannot buy what you cannot afford, own already, or does not exist', () => {
    const poor = rich(10);
    expect(buyHammer(poor, 'claw')).toBe(poor);
    const owns = buyHammer(rich(), 'claw');
    expect(buyHammer(owns, 'claw')).toBe(owns);
    expect(buyHammer(owns, 'nope')).toBe(owns);
  });
  it('can only equip owned hammers', () => {
    const s = buyHammer(rich(), 'sledge');
    expect(equipHammer(s, 'mallet').hammer).toBe('mallet');
    expect(equipHammer(s, 'gavel')).toBe(s);
  });
  it('hammer damage climbs with price', () => {
    for (let i = 1; i < HAMMERS.length; i++) {
      expect(HAMMERS[i].damage).toBeGreaterThan(HAMMERS[i - 1].damage);
      expect(HAMMERS[i].cost).toBeGreaterThan(HAMMERS[i - 1].cost);
    }
  });
});

describe('abilities and supplies', () => {
  it('quake and trap start unlocked; freeze and frenzy cost gold to unlock', () => {
    expect(defaultSave().abilities).toEqual({ quake: 1, trap: 1, freeze: 0, frenzy: 0 });
    const s = buyAbility(rich(), 'freeze');
    expect(s.abilities.freeze).toBe(1);
    expect(s.gold).toBe(100_000 - ABILITY.freeze.costs[0]);
  });
  it('levels cap at 5 and costs follow the table', () => {
    let s = rich();
    for (let i = 0; i < 10; i++) s = buyAbility(s, 'quake');
    expect(s.abilities.quake).toBe(5);
    expect(abilityCost(s, 'quake')).toBeNull();
    expect(abilityCost(defaultSave(), 'quake')).toBe(ABILITY.quake.costs[1]);
  });
  it('hard hats cost gold and cap at MAX_HARD_HATS; gold never goes negative', () => {
    let s = rich(HARD_HAT_COST * 20);
    for (let i = 0; i < 20; i++) s = buyHardHat(s);
    expect(s.hardHats).toBe(MAX_HARD_HATS);
    expect(s.gold).toBe(HARD_HAT_COST * (20 - MAX_HARD_HATS));
    expect(buyHardHat(rich(HARD_HAT_COST - 1)).hardHats).toBe(0);
  });
  it('skins equip only when owned; empty unequips', () => {
    const s = { ...defaultSave(), skins: ['dots'] };
    expect(equipSkin(s, 'dots').skin).toBe('dots');
    expect(equipSkin(s, 'gilded')).toBe(s);
    expect(equipSkin({ ...s, skin: 'dots' }, '').skin).toBe('');
  });
});

describe('gear in a shift', () => {
  it('applies hammer damage, ability levels, at most HARD_HATS_PER_SHIFT hard hats, upgrades and tools', () => {
    const save: Save = { ...buyHammer(rich(), 'sledge'), hardHats: 7, upgrades: { 'steel-toe-boots': 1 } };
    const cfg = applyGear(shiftConfigForDepth(1), save, ['lead-weight']);
    expect(cfg.damage).toBe(3 + 1);
    expect(cfg.hardHats).toBe(HARD_HATS_PER_SHIFT);
    expect(cfg.lives).toBe(4);
    expect(cfg.abilities).toEqual(save.abilities);
  });
  it('player power follows the hammer (daily scaling)', () => {
    expect(playerPower(defaultSave())).toBe(1);
    expect(playerPower(buyHammer(rich(), 'steam'))).toBe(5);
  });
});

describe('season pass', () => {
  it('seasons are 30-day UTC windows; a new season resets progress', () => {
    const id = seasonOf(NOW);
    expect(seasonOf(seasonEnds(id))).toBe(id + 1);
    const old = { ...defaultSave(), season: { id: id - 1, xp: 999, free: [1], paid: [1] } };
    expect(currentSeason(old, NOW).season).toEqual({ id, xp: 0, free: [], paid: [] });
  });
  it('xp unlocks tiers; free claims need no pass, paid claims do', () => {
    let s = addSeasonXp(defaultSave(), NOW, TIER_XP * 2);
    expect(tierReached(s)).toBe(2);
    const free = claimTier(s, NOW, 1, 'free', false);
    expect(free.gold).toBe(TIERS[0].free.gold);
    expect(claimTier(free, NOW, 1, 'free', false)).toBe(free); // once only
    expect(claimTier(s, NOW, 3, 'free', false)).toBe(s); // not reached
    expect(claimTier(s, NOW, 1, 'paid', false)).toBe(s); // no pass
    s = claimTier(s, NOW, 1, 'paid', true);
    expect(s.season.paid).toEqual([1]);
  });
  it('the free track is complete: every tier has a reward, including a cosmetic', () => {
    for (const t of TIERS) expect(Object.keys(t.free).length).toBeGreaterThan(0);
    expect(TIERS.some((t) => (t.free.skins ?? []).length > 0)).toBe(true);
    expect(TIERS.length * TIER_XP / XP_SHIFT).toBeLessThanOrEqual(150); // reachable in a month of play
  });
});

describe('store grants', () => {
  it('a product pays out once', () => {
    const s = grantProduct(defaultSave(), 'starter_pack');
    expect(s).toMatchObject({ gold: 500, hardHats: 3, skins: ['stripes'], granted: ['starter_pack'] });
    expect(grantProduct(s, 'starter_pack')).toBe(s);
  });
  it('no product grants power: only gold, hard hats (capped) and skins', () => {
    for (const p of PRODUCTS) for (const key of Object.keys(p.grant)) expect(['gold', 'hardHats', 'skins']).toContain(key);
    expect(applyGrant({ ...defaultSave(), hardHats: 8 }, { hardHats: 5 }).hardHats).toBe(MAX_HARD_HATS);
  });
});

describe('save', () => {
  it('new fields survive a round trip; garbage is cleaned', () => {
    const s = { ...buyHammer(rich(), 'claw'), hardHats: 4, arena: 3, playedMs: 123_456, skins: ['dots'], skin: 'dots', granted: ['starter_pack'] };
    expect(sanitizeSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const junk = sanitizeSave({ hammers: ['claw', 'laser'], hammer: 'laser', abilities: { quake: 99, freeze: -2 }, hardHats: 50, skins: ['nope'], skin: 'nope', season: { id: 'x' } });
    expect(junk).toMatchObject({ hammers: ['mallet', 'claw'], hammer: 'mallet', hardHats: MAX_HARD_HATS, skins: [], skin: '' });
    expect(junk.abilities).toEqual({ quake: 5, trap: 1, freeze: 0, frenzy: 0 });
    expect(junk.season.id).toBe(-1);
  });
});
