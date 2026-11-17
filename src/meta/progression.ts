import { ABILITIES, MAX_ABILITY_LEVEL, type AbilityId } from '../data/abilities';
import { HAMMER } from '../data/hammers';
import { SKIN } from '../data/skins';
import type { Grant } from '../data/store';
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
  muted: boolean;
  arena: number; // checkpoint: the arena a run starts in; advances when an arena is cleared
  playedMs: number; // all shift time ever played; the leaderboard checks depth against it
  hammers: string[]; // owned; always includes the mallet
  hammer: string; // equipped
  abilities: Record<AbilityId, number>; // levels, 0 = locked
  hardHats: number; // bought shields in stock
  skins: string[]; // owned cosmetics
  skin: string; // equipped hammer skin, '' for none
  season: SeasonProgress;
  granted: string[]; // one-time purchases already paid out (store product ids)
}

export interface SeasonProgress { id: number; xp: number; free: number[]; paid: number[] } // claimed tiers, 1-based

export const MAX_HARD_HATS = 9;

export const defaultSave = (): Save => ({
  version: 1, gold: 0, bestDepth: 0, upgrades: {}, daily: { date: '', bestDepth: 0 }, ads: defaultAds(), playerId: '', pending: [], muted: false,
  arena: 0, playedMs: 0, hammers: ['mallet'], hammer: 'mallet',
  abilities: Object.fromEntries(ABILITIES.map((a) => [a.id, a.startLevel])) as Record<AbilityId, number>,
  hardHats: 0, skins: [], skin: '', season: { id: -1, xp: 0, free: [], paid: [] }, granted: [],
});

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
  save.muted = r.muted === true;
  save.arena = count(r.arena);
  save.playedMs = count(r.playedMs);
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  save.hammers = ['mallet', ...new Set(strings(r.hammers).filter((id) => id in HAMMER && id !== 'mallet'))];
  save.hammer = typeof r.hammer === 'string' && save.hammers.includes(r.hammer) ? r.hammer : 'mallet';
  const abilities = record(r.abilities);
  for (const def of ABILITIES) save.abilities[def.id] = Math.max(def.startLevel, count(abilities[def.id], MAX_ABILITY_LEVEL));
  save.hardHats = count(r.hardHats, MAX_HARD_HATS);
  save.skins = [...new Set(strings(r.skins).filter((id) => id in SKIN))];
  save.skin = typeof r.skin === 'string' && save.skins.includes(r.skin) ? r.skin : '';
  const season = record(r.season);
  const tiers = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((t): t is number => Number.isInteger(t) && t >= 1 && t <= 100))];
  if (Number.isInteger(season.id)) save.season = { id: season.id as number, xp: count(season.xp), free: tiers(season.free), paid: tiers(season.paid) };
  save.granted = [...new Set(strings(r.granted))];
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

// Apply a reward or purchase contents. Skins already owned are not duplicated; hard hats cap at MAX_HARD_HATS.
export function applyGrant(save: Save, grant: Grant): Save {
  return {
    ...save,
    gold: save.gold + count(grant.gold),
    hardHats: Math.min(MAX_HARD_HATS, save.hardHats + count(grant.hardHats)),
    skins: [...new Set([...save.skins, ...(grant.skins ?? []).filter((id) => id in SKIN)])],
  };
}
