// Ad policy, pure. The only code allowed to decide whether an ad may show.
// Hard rules (CLAUDE.md): never mid-shift, interstitials only on results/draft and capped,
// Remove Ads turns interstitials off, rewarded ads are always the player's choice.

export const INTERSTITIAL_EVERY = 4; // at most one interstitial per this many finished shifts
export const CHESTS_PER_DAY = 3;
export const CHEST_GOLD = 40; // fixed amount: no random rewards

export type RewardedPlacement = 'revive' | 'double_gold' | 'reroll_draft' | 'gold_chest';
export type InterstitialPlacement = 'results' | 'draft';
const INTERSTITIAL_PLACEMENTS: readonly string[] = ['results', 'draft'];

export interface AdsState {
  shiftsSinceInterstitial: number;
  chestDate: string; // UTC date key of the last chest
  chestCount: number; // chests opened on chestDate
}

export const defaultAds = (): AdsState => ({ shiftsSinceInterstitial: 0, chestDate: '', chestCount: 0 });

export function canShowInterstitial(ads: AdsState, placement: string, opts: { removeAds: boolean; inShift: boolean }): boolean {
  if (opts.inShift || opts.removeAds) return false;
  if (!INTERSTITIAL_PLACEMENTS.includes(placement)) return false;
  return ads.shiftsSinceInterstitial >= INTERSTITIAL_EVERY;
}

export const afterShift = (ads: AdsState): AdsState => ({ ...ads, shiftsSinceInterstitial: ads.shiftsSinceInterstitial + 1 });
export const afterInterstitial = (ads: AdsState): AdsState => ({ ...ads, shiftsSinceInterstitial: 0 });

export const chestsLeft = (ads: AdsState, today: string): number =>
  ads.chestDate === today ? Math.max(0, CHESTS_PER_DAY - ads.chestCount) : CHESTS_PER_DAY;

// Returns the same state if no chest is left today.
export function afterChest(ads: AdsState, today: string): AdsState {
  if (chestsLeft(ads, today) === 0) return ads;
  return { ...ads, chestDate: today, chestCount: ads.chestDate === today ? ads.chestCount + 1 : 1 };
}
