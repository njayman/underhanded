import type { ToolMods } from './tools';

// Permanent upgrades bought with banked gold at Head Office. Gold comes only from play.
// Add an upgrade by adding an entry. `mods` apply once per level, through the same path as tools.
export interface UpgradeDef {
  id: string;
  name: string;
  blurb: string;
  maxLevel: number;
  baseCost: number; // cost of level 1
  costGrowth: number; // each further level costs this many times the last
  mods: ToolMods;
}

const upgrades: UpgradeDef[] = [
  { id: 'bigger-pockets', name: 'Bigger Pockets', blurb: '+10% gold from every bonk.', maxLevel: 5, baseCost: 60, costGrowth: 1.8, mods: { goldMult: 1.1 } },
  { id: 'strong-tea', name: 'Strong Tea', blurb: 'Moles linger 5% longer.', maxLevel: 4, baseCost: 80, costGrowth: 1.7, mods: { upScale: 1.05 } },
  { id: 'steel-toe-boots', name: 'Steel-Toe Boots', blurb: '+1 life every shift.', maxLevel: 2, baseCost: 150, costGrowth: 3, mods: { lives: 1 } },
  { id: 'padded-mallet', name: 'Padded Mallet', blurb: 'Forgives one foreman bonk a shift.', maxLevel: 1, baseCost: 300, costGrowth: 1, mods: { decoyShields: 1 } },
  { id: 'net-licence', name: 'Net Licence', blurb: 'Forgives one lost golden a shift.', maxLevel: 1, baseCost: 300, costGrowth: 1, mods: { goldenShields: 1 } },
];

export const UPGRADES: Record<string, UpgradeDef> = Object.fromEntries(upgrades.map((u) => [u.id, u]));
