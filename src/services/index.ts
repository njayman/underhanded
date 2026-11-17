import { getSave, setSave } from '../meta/storage';
import { createAdGate } from './ads/ad-gate';
import { overlayAdService } from './ads/overlay-ad-service';
import { createMockPurchaseService } from './iap/mock-purchase-service';
import { createLocalLeaderboard } from './leaderboard/local-leaderboard';
import { createSupabaseLeaderboard } from './leaderboard/supabase-leaderboard';

// The live services. Scenes import from here and nothing else under services/.
// ponytail: mock ad and purchase providers in every build. Swap in the AdMob and store-billing
// implementations here before release; nothing outside this file needs to change. Do not ship the mocks.
export const purchases = createMockPurchaseService([], localStorage);
export const ads = createAdGate(overlayAdService, purchases, {
  get: () => getSave().ads,
  set: (next) => setSave({ ...getSave(), ads: next }),
});

// Online board when the Supabase project is configured at build time (.env.local), local stand-in otherwise.
// The publishable key is public by design: it ships inside the app. Never put a secret key here.
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env;
export const leaderboard = url && key ? createSupabaseLeaderboard(`${url}/rest/v1`, key) : createLocalLeaderboard();
