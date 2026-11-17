import { describe, it, expect } from 'vitest';
import { arenaName, arenaOf, arenaShifts, moleHp, shiftConfigForDepth, shiftsBefore } from '../src/generation/depth';
import { LAYERS } from '../src/data/layers';
import { MOLES } from '../src/data/moles';

describe('arenas', () => {
  it('beginner arenas have 3 shifts, mid arenas 5, later arenas 10', () => {
    expect([0, 1, 2, 3, 4, 5, 40].map(arenaShifts)).toEqual([3, 3, 5, 5, 10, 10, 10]);
  });
  it('shiftsBefore is the running total of arena lengths', () => {
    let total = 0;
    for (let a = 0; a < 30; a++) {
      expect(shiftsBefore(a)).toBe(total);
      total += arenaShifts(a);
    }
  });
  it('arenaOf inverts shiftsBefore for every depth', () => {
    for (let depth = 1; depth <= 400; depth++) {
      const { arena, shift, shifts } = arenaOf(depth);
      expect(shiftsBefore(arena) + shift + 1).toBe(depth);
      expect(shift).toBeGreaterThanOrEqual(0);
      expect(shift).toBeLessThan(shifts);
    }
  });
  it('arenas cycle the departments, with a tier numeral after the first lap', () => {
    expect(arenaName(0)).toBe(LAYERS[0].name);
    expect(arenaName(LAYERS.length)).toBe(`${LAYERS[0].name} II`);
    expect(shiftConfigForDepth(shiftsBefore(5) + 1).layer).toBe(LAYERS[5 % LAYERS.length]);
  });
});

describe('shiftConfigForDepth', () => {
  it('is deterministic', () => {
    expect(shiftConfigForDepth(7)).toEqual(shiftConfigForDepth(7));
  });
  it('only an arena\'s last shift has a boss', () => {
    for (let depth = 1; depth <= 60; depth++) {
      const cfg = shiftConfigForDepth(depth);
      expect(cfg.boss !== null).toBe(cfg.shiftInArena === cfg.arenaShifts - 1);
      if (cfg.boss) expect(cfg.boss).toBe(cfg.layer.boss);
    }
  });
  it('mole hp rises every shift, without end', () => {
    for (let depth = 1; depth < 120; depth++) expect(shiftConfigForDepth(depth + 1).hpScale).toBeGreaterThan(shiftConfigForDepth(depth).hpScale);
  });
  it('each department spawns faster every time it comes round (until the floor)', () => {
    for (let arena = 0; arena < 30; arena++) {
      const now = shiftConfigForDepth(shiftsBefore(arena) + 1);
      const again = shiftConfigForDepth(shiftsBefore(arena + LAYERS.length) + 1);
      expect(again.layer).toBe(now.layer);
      expect(again.spawnEveryMs).toBeLessThanOrEqual(now.spawnEveryMs);
      expect(again.upScale).toBeLessThanOrEqual(now.upScale);
    }
  });
  it('tougher moles join as depth grows', () => {
    expect(shiftConfigForDepth(1).moles.courier).toBeUndefined();
    expect(shiftConfigForDepth(4).moles.courier).toBeGreaterThan(0);
    expect(shiftConfigForDepth(7).moles.auditor).toBeUndefined();
    expect(shiftConfigForDepth(8).moles.auditor).toBeGreaterThan(0);
  });
  it('mole hp scales with depth and with player power', () => {
    expect(moleHp('clerk', shiftConfigForDepth(1))).toBe(MOLES.clerk.hp);
    expect(moleHp('clerk', shiftConfigForDepth(21))).toBe(Math.round(MOLES.clerk.hp * 3));
    expect(moleHp('clerk', shiftConfigForDepth(1, 3))).toBe(MOLES.clerk.hp * 3);
    expect(shiftConfigForDepth(3, 3).bossHp).toBe(Math.round(MOLES.archivist.hp * 1.2 * 3));
  });
  it('stays playable at absurd depth', () => {
    const c = shiftConfigForDepth(10_000);
    expect(c.spawnEveryMs).toBeGreaterThanOrEqual(320);
    expect(c.upScale).toBeGreaterThanOrEqual(0.6);
    expect(c).toMatchObject({ lives: 3, durationMs: 60_000 });
  });
  it('every layer only references defined moles, and its boss is a boss', () => {
    for (const layer of LAYERS) {
      for (const id of Object.keys(layer.moles)) expect(MOLES[id]).toBeDefined();
      expect(MOLES[layer.boss].boss).toBe(true);
    }
  });
});
