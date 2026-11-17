// Single service layer for purchases. Products are cosmetics, starter pack, season pass, convenience boosts, Remove Ads.
export interface PurchaseService {
  isOwned(productId: string): Promise<boolean>;
  purchase(productId: string): Promise<boolean>;
}
