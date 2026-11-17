import { ABILITY, MAX_ABILITY_LEVEL, type AbilityId } from '../data/abilities';
import { HAMMER } from '../data/hammers';
import { MAX_HARD_HATS, type Save } from './progression';

// Workshop purchases, all with gold earned in play. Each returns the same save when it cannot happen.

export const HARD_HAT_COST = 60;

export function buyHammer(save: Save, id: string): Save {
  const def = HAMMER[id];
  if (!def || save.hammers.includes(id) || save.gold < def.cost) return save;
  return { ...save, gold: save.gold - def.cost, hammers: [...save.hammers, id], hammer: id }; // equip on purchase
}

export function equipHammer(save: Save, id: string): Save {
  return save.hammers.includes(id) && save.hammer !== id ? { ...save, hammer: id } : save;
}

// Gold for the next level of an ability (level 0 -> 1 unlocks it), or null when maxed.
export function abilityCost(save: Save, id: AbilityId): number | null {
  const level = save.abilities[id];
  return level >= MAX_ABILITY_LEVEL ? null : ABILITY[id].costs[level];
}

export function buyAbility(save: Save, id: AbilityId): Save {
  const cost = abilityCost(save, id);
  if (cost === null || save.gold < cost) return save;
  return { ...save, gold: save.gold - cost, abilities: { ...save.abilities, [id]: save.abilities[id] + 1 } };
}

export function buyHardHat(save: Save): Save {
  if (save.hardHats >= MAX_HARD_HATS || save.gold < HARD_HAT_COST) return save;
  return { ...save, gold: save.gold - HARD_HAT_COST, hardHats: save.hardHats + 1 };
}

export function equipSkin(save: Save, id: string): Save {
  if (id === '') return { ...save, skin: '' };
  return save.skins.includes(id) ? { ...save, skin: id } : save;
}
