import type { PurchaseService } from './purchase-service';

// In-memory purchases for tests and for development before a store SDK is installed.
export function createMockPurchaseService(owned: string[] = []): PurchaseService {
  const set = new Set(owned);
  return {
    async isOwned(productId) { return set.has(productId); },
    async purchase(productId) { set.add(productId); return true; },
  };
}
