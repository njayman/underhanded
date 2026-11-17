import type { InterstitialPlacement, RewardedPlacement } from '../../rules/ads';

// The ad provider. One implementation per SDK (AdMob later), plus mocks. Game code never calls this
// directly: it goes through the AdGate (./ad-gate.ts), which enforces the ad rules.
export interface AdService {
  // Resolves true only if the player watched to the end and earned the reward.
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
  // Resolves true if an ad was actually shown.
  showInterstitial(placement: InterstitialPlacement): Promise<boolean>;
}
