import type { AdService } from './ad-service';

// Headless mock for unit tests: rewards always granted, interstitials always "shown", calls recorded.
export function createMockAdService(rewardGranted = true): AdService & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async showRewarded(placement) { calls.push(`rewarded:${placement}`); return rewardGranted; },
    async showInterstitial(placement) { calls.push(`interstitial:${placement}`); return true; },
  };
}
