import { LAYERS, type LayerDef } from '../data/layers';
import { MOLES } from '../data/moles';

export interface ShiftConfig {
  depth: number; // 1-based
  layer: LayerDef;
  durationMs: number;
  lives: number;
  holes: number;
  spawnEveryMs: number;
  upScale: number; // multiplier on each mole's upMs
  moles: Record<string, number>; // mole id -> spawn weight, from the layer, adjusted by tools
  goldMult: number;
  decoyShields: number; // foreman bonks forgiven this shift
  goldenShields: number; // escaped golden moles forgiven this shift
  boss: string; // boss mole id
  bossAtMs: number; // boss arrives when this much time is left
  bossHp: number;
}

// Depth -> shift settings. Layers cycle forever; every depth is a little faster than the last.
export function shiftConfigForDepth(depth: number): ShiftConfig {
  const d = Math.max(1, Math.floor(depth));
  const layer = LAYERS[(d - 1) % LAYERS.length];
  const speed = 1 + 0.07 * (d - 1);
  const cycle = Math.floor((d - 1) / LAYERS.length); // times this layer has been visited before
  return {
    depth: d,
    layer,
    durationMs: 60_000,
    lives: 3,
    holes: 9,
    spawnEveryMs: Math.max(260, layer.spawnEveryMs / speed),
    upScale: Math.max(0.5, 1 - 0.03 * (d - 1)),
    moles: { ...layer.moles },
    goldMult: 1,
    decoyShields: 0,
    goldenShields: 0,
    boss: layer.boss,
    bossAtMs: 15_000,
    bossHp: (MOLES[layer.boss].hp ?? 1) + 2 * Math.min(cycle, 4), // capped so it stays beatable in 15s
  };
}
