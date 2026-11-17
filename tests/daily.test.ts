import { describe, it, expect } from 'vitest';
import { MOLES } from '../src/data/moles';
import { shiftConfigForDepth } from '../src/generation/depth';
import { defaultSave, dailyBest, recordDaily, sanitizeSave } from '../src/meta/progression';
import { hashString } from '../src/rules/rng';
import { newDailyRun, newRun, streamFor, utcDateKey, type Run } from '../src/rules/run';
import { createShift, tick, whack } from '../src/rules/shift';
import { draftOffer } from '../src/rules/tools';

describe('daily seed', () => {
  it('the date key is the UTC date, whatever the local clock says', () => {
    expect(utcDateKey(new Date('2026-11-16T23:59:59.999Z'))).toBe('2026-11-16');
    expect(utcDateKey(new Date('2026-11-17T00:00:00.000Z'))).toBe('2026-11-17');
    expect(utcDateKey(new Date('2026-11-17T08:30:00+13:00'))).toBe('2026-11-16'); // morning of the 17th in Auckland
  });
  it('same UTC day gives the same run, the next day a different one', () => {
    const a = newDailyRun(new Date('2026-11-16T00:00:01Z'));
    const b = newDailyRun(new Date('2026-11-16T23:59:59Z'));
    const c = newDailyRun(new Date('2026-11-17T00:00:00Z'));
    expect({ ...a, id: '' }).toEqual({ ...b, id: '' }); // same run in every way but its id
    expect(a.id).not.toBe(b.id); // each attempt is its own leaderboard submission
    expect(a.daily).toBe('2026-11-16');
    expect(c.seed).not.toBe(a.seed);
    expect(newRun(5).daily).toBeNull();
  });
  it('hashString is stable and spreads', () => {
    expect(hashString('daily:2026-11-16')).toBe(hashString('daily:2026-11-16'));
    const seeds = new Set(Array.from({ length: 366 }, (_, d) => hashString(`daily:${utcDateKey(new Date(Date.UTC(2026, 0, 1 + d)))}`)));
    expect(seeds.size).toBe(366);
  });
});

describe('streams', () => {
  const run = newDailyRun(new Date('2026-11-16T12:00:00Z'));
  const take = (rng: () => number) => [rng(), rng(), rng()];
  it('are repeatable, and differ by purpose and by depth', () => {
    expect(take(streamFor(run, 'spawn'))).toEqual(take(streamFor(run, 'spawn')));
    expect(take(streamFor(run, 'spawn'))).not.toEqual(take(streamFor(run, 'hop')));
    expect(take(streamFor(run, 'spawn'))).not.toEqual(take(streamFor({ ...run, depth: 2 }, 'spawn')));
  });
  it('do not depend on gold or tools picked up along the way', () => {
    const other: Run = { ...run, gold: 999, tools: ['gold-pan'] };
    expect(take(streamFor(other, 'spawn'))).toEqual(take(streamFor(run, 'spawn')));
  });
  it('everyone is offered the same draft at the same depth', () => {
    expect(draftOffer([], streamFor(run, 'draft'))).toEqual(draftOffer([], streamFor({ ...run, gold: 50 }, 'draft')));
  });
});

// The point of a daily run: what the game sends you must not depend on how you play.
describe('same moles for every player', () => {
  for (const depth of [1, 2, 3, 4]) {
    it(`depth ${depth}: an idle player and a busy player get the same spawn rolls`, () => {
      const run: Run = { ...newDailyRun(new Date('2026-11-16T12:00:00Z')), depth };
      const cfg = { ...shiftConfigForDepth(depth), lives: 9999 }; // nobody gets sacked early
      const play = (busy: boolean) => {
        const rolls: number[] = [];
        const base = streamFor(run, 'spawn');
        const spawnRng = () => { const v = base(); rolls.push(v); return v; };
        const hopRng = streamFor(run, 'hop');
        let state = createShift(cfg);
        let bonks = 0;
        while (!state.result) {
          state = tick(state, 16, cfg, spawnRng, hopRng).state;
          if (!busy) continue;
          state.holes.forEach((m, i) => {
            if (!m || MOLES[m.kind].hitCostsLife) return;
            state = whack(state, i, cfg, hopRng).state;
            bonks++;
          });
        }
        return { rolls, bonks };
      };
      const idle = play(false);
      const busy = play(true);
      expect(busy.bonks).toBeGreaterThan(20);
      expect(idle.rolls.length).toBeGreaterThan(50);
      expect(busy.rolls).toEqual(idle.rolls);
    });
  }
});

describe('daily record', () => {
  it('keeps the best depth for the day and resets on a new day', () => {
    let save = recordDaily(defaultSave(), '2026-11-16', 3);
    save = recordDaily(save, '2026-11-16', 2);
    expect(dailyBest(save, '2026-11-16')).toBe(3);
    expect(dailyBest(save, '2026-11-17')).toBe(0);
    save = recordDaily(save, '2026-11-17', 1);
    expect(save.daily).toEqual({ date: '2026-11-17', bestDepth: 1 });
  });
  it('old saves without a daily record load cleanly, bad ones are dropped', () => {
    expect(sanitizeSave({ version: 1, gold: 5, bestDepth: 2, upgrades: {} }).daily).toEqual({ date: '', bestDepth: 0 });
    expect(sanitizeSave({ daily: { date: 'yesterday', bestDepth: 9 } }).daily).toEqual({ date: '', bestDepth: 0 });
    expect(sanitizeSave({ daily: { date: '2026-11-16', bestDepth: 4.8 } }).daily).toEqual({ date: '2026-11-16', bestDepth: 4 });
  });
});
