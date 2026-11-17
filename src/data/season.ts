import type { Grant } from './store';

// Season pass: 30-day seasons on the UTC calendar. Two tracks, both visible from day one. The free track
// is complete (gold, hard hats and its own cosmetic). The paid track adds more, never power.
export const SEASON_DAYS = 30;
export const FIRST_SEASON = 692; // the season running at launch (Nov 2026) is shown as Season 1
export const seasonNumber = (id: number): number => id - FIRST_SEASON + 1;
export const TIER_XP = 60;
export const XP_SHIFT = 10; // per cleared shift
export const XP_BOSS = 25; // per boss fired

export interface Tier { free: Grant; paid: Grant }

export const TIERS: Tier[] = Array.from({ length: 20 }, (_, i): Tier => {
  const n = i + 1;
  const free: Grant = n === 20 ? { skins: ['checks'] } : n % 5 === 0 ? { hardHats: 2 } : { gold: 40 + n * 10 };
  const paid: Grant = n === 10 || n === 20 ? { skins: ['zigzag'], gold: 200 } : n % 4 === 0 ? { hardHats: 2 } : { gold: 60 + n * 15 };
  return { free, paid: n === 10 ? { gold: 400 } : paid };
});
