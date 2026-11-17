// Real-money products. Hard rules (CLAUDE.md): cosmetics, a starter pack, the season pass and modest
// convenience only. Nothing here may gate depth, tools or layers, and nothing is random.
export type Grant = { gold?: number; hardHats?: number; skins?: string[] };

export interface ProductDef {
  id: string;
  name: string;
  blurb: string;
  price: string; // display placeholder; the store SDK supplies real localised prices
  oneTime: true; // every product can be bought once (season passes once per season)
  grant: Grant; // applied once, when bought
}

export const REMOVE_ADS = 'remove_ads';
export const seasonPassId = (season: number): string => `season_pass_${season}`;

export const PRODUCTS: ProductDef[] = [
  { id: REMOVE_ADS, name: 'Remove Ads', blurb: 'No more interstitials. Rewarded ads stay, if you want them.', price: '$2.99', oneTime: true, grant: {} },
  { id: 'starter_pack', name: 'Starter Pack', blurb: '500 gold, 3 hard hats and the Barber Pole hammer skin.', price: '$1.99', oneTime: true, grant: { gold: 500, hardHats: 3, skins: ['stripes'] } },
  { id: 'skin_dots', name: 'Polka Proof', blurb: 'Hammer skin. Purely for style.', price: '$0.99', oneTime: true, grant: { skins: ['dots'] } },
  { id: 'skin_gilded', name: 'Gilded Edition', blurb: 'Hammer skin. Shiny, and nothing else.', price: '$1.99', oneTime: true, grant: { skins: ['gilded'] } },
];

export const PRODUCT = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<string, ProductDef>;
