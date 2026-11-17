import type { PurchaseService } from './purchase-service';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'underhanded.mockpurchases.v1';

// Stand-in purchases until a store SDK is installed: every purchase succeeds instantly, for free.
// With a `store`, ownership survives reloads (development builds); without one it is memory only (tests).
export function createMockPurchaseService(owned: string[] = [], store?: Store): PurchaseService {
  const read = (): string[] => {
    try {
      const v: unknown = JSON.parse(store?.getItem(KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  const set = new Set([...owned, ...read()]);
  return {
    async isOwned(productId) { return set.has(productId); },
    async purchase(productId) {
      set.add(productId);
      try { store?.setItem(KEY, JSON.stringify([...set])); } catch { /* memory only */ }
      return true;
    },
  };
}
