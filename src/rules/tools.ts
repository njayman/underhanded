import { TOOLS, type ToolMods } from '../data/tools';
import type { ShiftConfig } from '../generation/depth';

// Fold a list of modifiers (tools, upgrade levels) into a shift's settings. Repeats apply again.
export function applyMods(base: ShiftConfig, mods: ToolMods[]): ShiftConfig {
  const cfg: ShiftConfig = { ...base, moles: { ...base.moles } };
  for (const m of mods) {
    cfg.lives += m.lives ?? 0;
    cfg.decoyShields += m.decoyShields ?? 0;
    cfg.goldenShields += m.goldenShields ?? 0;
    cfg.goldMult *= m.goldMult ?? 1;
    cfg.upScale *= m.upScale ?? 1;
    cfg.spawnEveryMs *= m.spawnEvery ?? 1;
    cfg.damage += m.damage ?? 0;
    cfg.meterGain *= m.meterGain ?? 1;
    for (const [mole, w] of Object.entries(m.weightMult ?? {})) if (mole in cfg.moles) cfg.moles[mole] *= w;
  }
  return cfg;
}

export const applyTools = (base: ShiftConfig, owned: string[]): ShiftConfig =>
  applyMods(base, owned.map((id) => TOOLS[id].mods));

// Up to `count` distinct tools the player can still take, in seeded random order.
// `exclude` is for rerolls: tools from the offer being replaced are left out when enough others remain.
export function draftOffer(owned: string[], rng: () => number, count = 3, exclude: string[] = []): string[] {
  const takeable = Object.values(TOOLS)
    .filter((t) => owned.filter((id) => id === t.id).length < t.maxStacks)
    .map((t) => t.id);
  const fresh = takeable.filter((id) => !exclude.includes(id));
  const pool = fresh.length >= Math.min(count, takeable.length) ? fresh : takeable;
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}
