import type { ToolMods } from '../data/tools';
import { UPGRADES } from '../data/upgrades';
import { CHESTS_PER_DAY, defaultAds, type AdsState } from '../rules/ads';
import { isUuid, sanitizePending, type Submission } from './leaderboard';

// Everything that outlives a run. Pure: storage lives in ./storage.ts.
export interface Save {
  version: 1;
  gold: number; // banked, spendable
  bestDepth: number; // deepest shift played
  upgrades: Record<string, number>; // upgrade id -> level
  daily: { date: string; bestDepth: number }; // best depth in the daily run on that UTC date
  ads: AdsState; // interstitial counter and today's gold chests
  playerId: string; // uuid for the leaderboard; '' until storage assigns one
  pending: Submission[]; // finished runs not yet accepted by the leaderboard
}

export const defaultSave = (): Save => ({ version: 1, gold: 0, bestDepth: 0, upgrades: {}, daily: { date: '', bestDepth: 0 }, ads: defaultAds(), playerId: '', pending: [] });

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});
const count = (v: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;

// Stored data is untrusted (hand-edited, corrupted, from an older build): rebuild it field by field.
export function sanitizeSave(raw: unknown): Save {
  const save = defaultSave();
  if (typeof raw !== 'object' || raw === null) return save;
  const r = raw as Record<string, unknown>;
  save.gold = count(r.gold);
  save.bestDepth = count(r.bestDepth);
  const levels = typeof r.upgrades === 'object' && r.upgrades !== null ? (r.upgrades as Record<string, unknown>) : {};
  for (const def of Object.values(UPGRADES)) {
    const level = count(levels[def.id], def.maxLevel);
    if (level > 0) save.upgrades[def.id] = level;
  }
  const daily = record(r.daily);
  if (typeof daily.date === 'string' && DATE_KEY.test(daily.date)) save.daily = { date: daily.date, bestDepth: count(daily.bestDepth) };
  const ads = record(r.ads);
  save.ads.shiftsSinceInterstitial = count(ads.shiftsSinceInterstitial);
  if (typeof ads.chestDate === 'string' && DATE_KEY.test(ads.chestDate)) {
    save.ads.chestDate = ads.chestDate;
    save.ads.chestCount = count(ads.chestCount, CHESTS_PER_DAY);
  }
  if (isUuid(r.playerId)) save.playerId = r.playerId;
  save.pending = sanitizePending(r.pending);
  return save;
}

export const upgradeLevel = (save: Save, id: string): number => save.upgrades[id] ?? 0;

// Cost of the next level, or null when maxed.
export function upgradeCost(save: Save, id: string): number | null {
  const def = UPGRADES[id];
  const level = upgradeLevel(save, id);
  return level >= def.maxLevel ? null : Math.round(def.baseCost * def.costGrowth ** level);
}

// Returns the save after buying one level, or the same save if it cannot be bought.
export function buyUpgrade(save: Save, id: string): Save {
  if (!UPGRADES[id]) return save;
  const cost = upgradeCost(save, id);
  if (cost === null || cost > save.gold) return save;
  return { ...save, gold: save.gold - cost, upgrades: { ...save.upgrades, [id]: upgradeLevel(save, id) + 1 } };
}

// Bank a finished shift, cleared or not.
export function bankShift(save: Save, gold: number, depth: number): Save {
  return { ...save, gold: save.gold + count(gold), bestDepth: Math.max(save.bestDepth, count(depth)) };
}

// Record a finished daily shift. A new date replaces yesterday's record.
export function recordDaily(save: Save, date: string, depth: number): Save {
  const best = save.daily.date === date ? Math.max(save.daily.bestDepth, count(depth)) : count(depth);
  return { ...save, daily: { date, bestDepth: best } };
}

// Today's daily best, or 0 if not played today.
export const dailyBest = (save: Save, date: string): number => (save.daily.date === date ? save.daily.bestDepth : 0);

// One entry per owned level, for rules/tools.applyMods.
export function upgradeMods(save: Save): ToolMods[] {
  return Object.values(UPGRADES).flatMap((def) => Array<ToolMods>(upgradeLevel(save, def.id)).fill(def.mods));
}
