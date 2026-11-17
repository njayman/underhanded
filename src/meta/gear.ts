import type { ShiftConfig } from '../generation/depth';
import { HAMMER } from '../data/hammers';
import { applyMods, applyTools } from '../rules/tools';
import { upgradeMods, type Save } from './progression';

// Hard hats a player can carry into one shift. Each one used is taken from the save.
export const HARD_HATS_PER_SHIFT = 3;

export const hammerDamage = (save: Save): number => HAMMER[save.hammer]?.damage ?? 1;

// How strong the player is, for scaling daily runs: mole hp grows with your hammer, so the daily
// board compares skill, not gear. Ability levels and upgrades still help.
export const playerPower = (save: Save): number => hammerDamage(save);

// The full shift settings: depth, then permanent upgrades, then the player's kit, then run tools.
export function applyGear(base: ShiftConfig, save: Save, tools: string[]): ShiftConfig {
  const cfg = applyMods(base, upgradeMods(save));
  cfg.damage = cfg.damage - 1 + hammerDamage(save); // base damage 1 is the bare mallet
  cfg.abilities = { ...save.abilities };
  cfg.hardHats = Math.min(save.hardHats, HARD_HATS_PER_SHIFT);
  return applyTools(cfg, tools);
}
