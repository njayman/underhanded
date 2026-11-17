import { afterInterstitial, canShowInterstitial, type AdsState, type InterstitialPlacement, type RewardedPlacement } from '../../rules/ads';
import type { PurchaseService } from '../iap/purchase-service';
import type { AdService } from './ad-service';

export const REMOVE_ADS = 'remove_ads';

// Where the gate keeps the interstitial counter (the save, in the real game).
export interface AdsStore {
  get(): AdsState;
  set(ads: AdsState): void;
}

// The only door to ads. Scenes call this; it applies the rules, then asks the provider.
export interface AdGate {
  shiftStarted(): void; // no ad of any kind may show until shiftEnded()
  shiftEnded(): void;
  // Player chose to watch. True only if the reward was earned.
  rewarded(placement: RewardedPlacement): Promise<boolean>;
  // Shows an interstitial only if the cap allows it. True if one was shown.
  interstitialIfDue(placement: InterstitialPlacement): Promise<boolean>;
}

export function createAdGate(service: AdService, purchases: PurchaseService, store: AdsStore): AdGate {
  let inShift = false;
  let showing = false; // one ad at a time
  const exclusive = async (show: () => Promise<boolean>): Promise<boolean> => {
    if (inShift || showing) return false;
    showing = true;
    try {
      return await show();
    } catch {
      return false; // a failed ad never blocks the game and never grants a reward
    } finally {
      showing = false;
    }
  };
  return {
    shiftStarted: () => void (inShift = true),
    shiftEnded: () => void (inShift = false),
    rewarded: (placement) => exclusive(() => service.showRewarded(placement)),
    interstitialIfDue: (placement) =>
      exclusive(async () => {
        const removeAds = await purchases.isOwned(REMOVE_ADS).catch(() => false);
        if (!canShowInterstitial(store.get(), placement, { removeAds, inShift })) return false;
        const shown = await service.showInterstitial(placement);
        if (shown) store.set(afterInterstitial(store.get()));
        return shown;
      }),
  };
}
