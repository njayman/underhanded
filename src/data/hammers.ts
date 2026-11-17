// Hammers, bought with gold in the Workshop. Damage is what kills moles; deeper moles have more hp.
// Gold only: never sell power for real money (CLAUDE.md). Paid cosmetics are skins (src/data/skins.ts).
export interface HammerDef {
  id: string;
  name: string;
  blurb: string;
  damage: number;
  cost: number; // gold
  head: { w: number; h: number; claw?: true; band?: true; spikes?: true }; // drawing, see src/game/hammer.ts
}

export const HAMMERS: HammerDef[] = [
  { id: 'mallet', name: 'Wooden Mallet', blurb: 'Standard issue. Splinters included.', damage: 1, cost: 0, head: { w: 70, h: 44 } },
  { id: 'claw', name: 'Claw Hammer', blurb: 'Twice the bonk. Also pulls nails.', damage: 2, cost: 350, head: { w: 76, h: 36, claw: true } },
  { id: 'sledge', name: 'Sledgehammer', blurb: 'Clerks go flat in one swing.', damage: 3, cost: 1200, head: { w: 96, h: 52, band: true } },
  { id: 'steam', name: 'Steam Hammer', blurb: 'Pressure-rated. Auditors weep.', damage: 5, cost: 4000, head: { w: 104, h: 60, band: true, spikes: true } },
  { id: 'gavel', name: 'The Golden Gavel', blurb: 'Order. Order! Everyone is fired.', damage: 8, cost: 12000, head: { w: 112, h: 64, band: true, claw: true } },
];

export const HAMMER = Object.fromEntries(HAMMERS.map((h) => [h.id, h])) as Record<string, HammerDef>;
