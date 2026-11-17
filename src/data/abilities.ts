// Field abilities, fired during a shift with combo-meter charge. Levels are bought with gold in the
// Workshop. Level 0 = locked. `power` is indexed by level - 1.
export type AbilityId = 'quake' | 'trap' | 'freeze' | 'frenzy';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  blurb: string;
  charge: number; // meter it costs
  power: number[]; // per level: quake/trap damage, freeze/frenzy duration in ms
  costs: number[]; // gold to reach each level; costs[0] = unlock
  startLevel: number; // level every new player has
}

export const METER_MAX = 20;

export const ABILITIES: AbilityDef[] = [
  { id: 'quake', name: 'Quake', blurb: 'Stamp the floor: damages every mole on the board.', charge: 12, power: [2, 3, 4, 6, 9], costs: [0, 250, 700, 1800, 4500], startLevel: 1 },
  { id: 'trap', name: 'Mole Trap', blurb: 'Set on a hole. Snaps the next mole that pops up.', charge: 6, power: [3, 5, 8, 12, 20], costs: [0, 200, 600, 1500, 4000], startLevel: 1 },
  { id: 'freeze', name: 'Cold Snap', blurb: 'Moles freeze in place: nobody escapes.', charge: 10, power: [2500, 3200, 4000, 5000, 6000], costs: [300, 400, 900, 2000, 5000], startLevel: 0 },
  { id: 'frenzy', name: 'Frenzy', blurb: 'Double damage. Hit everything.', charge: 15, power: [4000, 5000, 6000, 7000, 8000], costs: [600, 600, 1400, 3000, 7000], startLevel: 0 },
];

export const ABILITY = Object.fromEntries(ABILITIES.map((a) => [a.id, a])) as Record<AbilityId, AbilityDef>;
export const MAX_ABILITY_LEVEL = 5;
