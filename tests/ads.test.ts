import { describe, it, expect } from 'vitest';
import { CHESTS_PER_DAY, INTERSTITIAL_EVERY, afterChest, afterInterstitial, afterShift, canShowInterstitial, chestsLeft, defaultAds, type AdsState } from '../src/rules/ads';
import { REMOVE_ADS, createAdGate } from '../src/services/ads/ad-gate';
import { createMockAdService } from '../src/services/ads/mock-ad-service';
import { createMockPurchaseService } from '../src/services/iap/mock-purchase-service';
import { defaultSave, sanitizeSave } from '../src/meta/progression';
import { shiftConfigForDepth } from '../src/generation/depth';
import { createShift, revive, tick } from '../src/rules/shift';
import { draftOffer } from '../src/rules/tools';
import { mulberry32 } from '../src/rules/rng';
import { TOOLS } from '../src/data/tools';

const free = { removeAds: false, inShift: false };
const shifts = (n: number): AdsState => ({ ...defaultAds(), shiftsSinceInterstitial: n });

describe('interstitial cap', () => {
  it('needs INTERSTITIAL_EVERY finished shifts since the last one', () => {
    for (let n = 0; n < INTERSTITIAL_EVERY; n++) expect(canShowInterstitial(shifts(n), 'results', free)).toBe(false);
    expect(canShowInterstitial(shifts(INTERSTITIAL_EVERY), 'results', free)).toBe(true);
    expect(canShowInterstitial(shifts(INTERSTITIAL_EVERY), 'draft', free)).toBe(true);
  });
  it('a new player sees none before their first INTERSTITIAL_EVERY shifts', () => {
    expect(canShowInterstitial(defaultAds(), 'results', free)).toBe(false);
  });
  it('never mid-shift, however overdue', () => {
    expect(canShowInterstitial(shifts(999), 'results', { removeAds: false, inShift: true })).toBe(false);
  });
  it('only on the results and draft screens', () => {
    for (const where of ['shift', 'office', 'boss', '']) expect(canShowInterstitial(shifts(999), where, free)).toBe(false);
  });
  it('Remove Ads turns interstitials off', () => {
    expect(canShowInterstitial(shifts(999), 'results', { removeAds: true, inShift: false })).toBe(false);
  });
  it('over a long session, at most one per INTERSTITIAL_EVERY shifts', () => {
    let ads = defaultAds();
    let shown = 0;
    for (let shift = 1; shift <= 100; shift++) {
      ads = afterShift(ads);
      if (canShowInterstitial(ads, 'results', free)) { shown++; ads = afterInterstitial(ads); }
    }
    expect(shown).toBe(100 / INTERSTITIAL_EVERY);
  });
});

describe('gold chest', () => {
  it('allows CHESTS_PER_DAY a day and refills on a new UTC date', () => {
    let ads = defaultAds();
    for (let i = 0; i < CHESTS_PER_DAY; i++) {
      expect(chestsLeft(ads, '2026-11-16')).toBe(CHESTS_PER_DAY - i);
      ads = afterChest(ads, '2026-11-16');
    }
    expect(chestsLeft(ads, '2026-11-16')).toBe(0);
    expect(afterChest(ads, '2026-11-16')).toBe(ads); // refused
    expect(chestsLeft(ads, '2026-11-17')).toBe(CHESTS_PER_DAY);
    expect(afterChest(ads, '2026-11-17').chestCount).toBe(1);
  });
});

describe('ad gate', () => {
  const setup = (ads = shifts(INTERSTITIAL_EVERY), owned: string[] = [], rewardGranted = true) => {
    const service = createMockAdService(rewardGranted);
    let state = ads;
    const gate = createAdGate(service, createMockPurchaseService(owned), { get: () => state, set: (next) => (state = next) });
    return { service, gate, state: () => state };
  };
  it('shows a due interstitial and resets the counter', async () => {
    const t = setup();
    expect(await t.gate.interstitialIfDue('results')).toBe(true);
    expect(t.service.calls).toEqual(['interstitial:results']);
    expect(t.state().shiftsSinceInterstitial).toBe(0);
    expect(await t.gate.interstitialIfDue('draft')).toBe(false); // cap: not again yet
    expect(t.service.calls).toHaveLength(1);
  });
  it('does not call the provider when the cap says no', async () => {
    const t = setup(shifts(INTERSTITIAL_EVERY - 1));
    expect(await t.gate.interstitialIfDue('results')).toBe(false);
    expect(t.service.calls).toEqual([]);
  });
  it('mid-shift: no interstitial and no rewarded ad reaches the provider', async () => {
    const t = setup(shifts(999));
    t.gate.shiftStarted();
    expect(await t.gate.interstitialIfDue('results')).toBe(false);
    expect(await t.gate.rewarded('revive')).toBe(false);
    expect(t.service.calls).toEqual([]);
    t.gate.shiftEnded();
    expect(await t.gate.rewarded('revive')).toBe(true);
    expect(await t.gate.interstitialIfDue('results')).toBe(true);
  });
  it('Remove Ads stops interstitials but rewarded ads still work', async () => {
    const t = setup(shifts(999), [REMOVE_ADS]);
    expect(await t.gate.interstitialIfDue('results')).toBe(false);
    expect(await t.gate.rewarded('double_gold')).toBe(true);
    expect(t.service.calls).toEqual(['rewarded:double_gold']);
  });
  it('a rewarded ad closed early earns nothing, and never touches the interstitial counter', async () => {
    const t = setup(shifts(2), [], false);
    expect(await t.gate.rewarded('gold_chest')).toBe(false);
    expect(t.state().shiftsSinceInterstitial).toBe(2);
  });
  it('one ad at a time: a second request while one is showing is refused', async () => {
    const t = setup();
    const [first, second] = await Promise.all([t.gate.rewarded('revive'), t.gate.rewarded('double_gold')]);
    expect([first, second]).toEqual([true, false]);
    expect(t.service.calls).toEqual(['rewarded:revive']);
  });
  it('a provider that throws gives no reward and does not break the gate', async () => {
    const boom = { showRewarded: async () => { throw new Error('sdk'); }, showInterstitial: async () => { throw new Error('sdk'); } };
    let state = shifts(999);
    const gate = createAdGate(boom, createMockPurchaseService(), { get: () => state, set: (next) => (state = next) });
    expect(await gate.rewarded('revive')).toBe(false);
    expect(await gate.interstitialIfDue('results')).toBe(false);
    expect(state.shiftsSinceInterstitial).toBe(999);
    expect(await gate.rewarded('revive')).toBe(false); // still answering, not stuck "showing"
  });
});

describe('revive', () => {
  const cfg = { ...shiftConfigForDepth(1), bossAtMs: -1 };
  it('a sacked shift carries on with one life and the same time and gold', () => {
    const sacked = { ...createShift(cfg), lives: 0, gold: 12, timeLeftMs: 20_000, result: 'failed' as const };
    const back = revive(sacked);
    expect(back).toMatchObject({ lives: 1, gold: 12, timeLeftMs: 20_000, result: null });
    expect(tick(back, 16, cfg, mulberry32(1)).state.result).toBeNull();
    expect(sacked.result).toBe('failed'); // input untouched
  });
  it('does nothing to a shift that was not sacked', () => {
    const live = createShift(cfg);
    expect(revive(live)).toBe(live);
    const cleared = { ...live, result: 'cleared' as const };
    expect(revive(cleared)).toBe(cleared);
  });
});

describe('draft reroll', () => {
  it('offers three tools that were not in the offer being replaced', () => {
    for (let seed = 0; seed < 30; seed++) {
      const first = draftOffer([], mulberry32(seed));
      const again = draftOffer([], mulberry32(seed + 1000), 3, first);
      expect(again).toHaveLength(3);
      for (const id of again) expect(first).not.toContain(id);
    }
  });
  it('falls back to repeats when too few other tools are left', () => {
    const all = Object.values(TOOLS).flatMap((t) => Array<string>(t.maxStacks).fill(t.id));
    const owned = all.filter((id) => id !== 'day-off' && id !== 'lucky-ledger');
    const first = draftOffer(owned, mulberry32(1));
    expect(first.sort()).toEqual(['day-off', 'lucky-ledger']);
    expect(draftOffer(owned, mulberry32(2), 3, first).sort()).toEqual(['day-off', 'lucky-ledger']);
  });
});

describe('ads in the save', () => {
  it('old saves get a clean ad record, bad values are reset, chest count is capped', () => {
    expect(sanitizeSave({ gold: 5 }).ads).toEqual(defaultAds());
    expect(sanitizeSave({ ads: { shiftsSinceInterstitial: -3, chestDate: 'today', chestCount: 2 } }).ads).toEqual(defaultAds());
    expect(sanitizeSave({ ads: { shiftsSinceInterstitial: 2.9, chestDate: '2026-11-16', chestCount: 50 } }).ads).toEqual({ shiftsSinceInterstitial: 2, chestDate: '2026-11-16', chestCount: CHESTS_PER_DAY });
    expect(defaultSave().ads).toEqual(defaultAds());
  });
});
