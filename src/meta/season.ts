import { SEASON_DAYS, TIERS, TIER_XP } from '../data/season';
import { PRODUCT, seasonPassId } from '../data/store';
import { applyGrant, type Save } from './progression';

// Season pass progress. Seasons are fixed 30-day windows on the UTC calendar, the same for everyone.
const DAY_MS = 86_400_000;
export const seasonOf = (now: Date): number => Math.floor(now.getTime() / DAY_MS / SEASON_DAYS);
export const seasonEnds = (season: number): Date => new Date((season + 1) * SEASON_DAYS * DAY_MS);

// The save's season record, reset when a new season has started.
export function currentSeason(save: Save, now: Date): Save {
  const id = seasonOf(now);
  return save.season.id === id ? save : { ...save, season: { id, xp: 0, free: [], paid: [] } };
}

export function addSeasonXp(save: Save, now: Date, xp: number): Save {
  const s = currentSeason(save, now);
  return { ...s, season: { ...s.season, xp: s.season.xp + Math.max(0, Math.floor(xp)) } };
}

export const tierReached = (save: Save): number => Math.min(TIERS.length, Math.floor(save.season.xp / TIER_XP));

// Claim one tier's reward on one track. The paid track needs this season's pass.
export function claimTier(save: Save, now: Date, tier: number, track: 'free' | 'paid', passOwned: boolean): Save {
  const s = currentSeason(save, now);
  if (!Number.isInteger(tier) || tier < 1 || tier > tierReached(s) || s.season[track].includes(tier)) return save;
  if (track === 'paid' && !passOwned) return save;
  const claimed = applyGrant(s, TIERS[tier - 1][track]);
  return { ...claimed, season: { ...claimed.season, [track]: [...claimed.season[track], tier] } };
}

// Pay out a store product once. Season passes grant nothing directly: they open the paid track.
export function grantProduct(save: Save, productId: string): Save {
  if (save.granted.includes(productId)) return save;
  const product = PRODUCT[productId];
  const granted = product ? applyGrant(save, product.grant) : save;
  return { ...granted, granted: [...granted.granted, productId] };
}

export const passProduct = (now: Date): string => seasonPassId(seasonOf(now));
