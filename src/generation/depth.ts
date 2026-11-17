import type { AbilityId } from '../data/abilities';
import { LAYERS, type LayerDef } from '../data/layers';
import { MOLES } from '../data/moles';

// Depth is the global shift number, 1-based, endless. Shifts are grouped into arenas: beginner arenas
// are short, later ones long. The last shift of every arena is its boss shift. Each arena is one
// department (layer), cycling, and every cycle is harder than the last.

export const arenaShifts = (arena: number): number => (arena < 2 ? 3 : arena < 4 ? 5 : 10);

// Depth of an arena's first shift, minus one.
export function shiftsBefore(arena: number): number {
  if (arena <= 2) return 3 * arena;
  if (arena <= 4) return 6 + 5 * (arena - 2);
  return 16 + 10 * (arena - 4);
}

export function arenaOf(depth: number): { arena: number; shift: number; shifts: number } {
  const d = Math.max(1, Math.floor(depth)) - 1;
  const arena = d < 6 ? Math.floor(d / 3) : d < 16 ? 2 + Math.floor((d - 6) / 5) : 4 + Math.floor((d - 16) / 10);
  return { arena, shift: d - shiftsBefore(arena), shifts: arenaShifts(arena) };
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export function arenaName(arena: number): string {
  const tier = Math.floor(arena / LAYERS.length) + 1;
  const name = LAYERS[arena % LAYERS.length].name;
  return tier === 1 ? name : `${name} ${ROMAN[tier] ?? tier}`;
}

// Tougher moles join the mix as depth grows.
const EXTRA_MOLES = [
  { id: 'courier', from: 4, weight: 1.5 },
  { id: 'auditor', from: 8, weight: 1 },
];

export interface ShiftConfig {
  depth: number;
  arena: number;
  shiftInArena: number; // 0-based
  arenaShifts: number;
  layer: LayerDef;
  durationMs: number;
  lives: number;
  holes: number;
  spawnEveryMs: number;
  upScale: number; // multiplier on each mole's upMs
  hpScale: number; // multiplier on each mole's hp
  moles: Record<string, number>; // mole id -> spawn weight
  goldMult: number;
  damage: number; // per hammer hit, before frenzy
  meterGain: number; // combo meter charge per hit
  abilities: Record<AbilityId, number>; // levels; 0 = locked
  decoyShields: number; // foreman bonks forgiven this shift
  goldenShields: number; // escaped golden moles forgiven this shift
  hardHats: number; // bought shields: each absorbs one lost life, any cause
  boss: string | null; // only on an arena's last shift
  bossAtMs: number; // boss arrives when this much time is left
  bossHp: number;
}

// power: scale mole hp to the player's strength (daily runs). 1 = unscaled.
export function shiftConfigForDepth(depth: number, power = 1): ShiftConfig {
  const d = Math.max(1, Math.floor(depth));
  const { arena, shift, shifts } = arenaOf(d);
  const layer = LAYERS[arena % LAYERS.length];
  const hpScale = (1 + 0.1 * (d - 1)) * Math.max(1, power);
  const moles = { ...layer.moles };
  for (const extra of EXTRA_MOLES) if (d >= extra.from) moles[extra.id] = extra.weight * (1 + (d - extra.from) * 0.05);
  const bossShift = shift === shifts - 1;
  return {
    depth: d,
    arena,
    shiftInArena: shift,
    arenaShifts: shifts,
    layer,
    durationMs: 60_000,
    lives: 3,
    holes: 9,
    spawnEveryMs: Math.max(320, layer.spawnEveryMs / (1 + 0.035 * (d - 1))),
    upScale: Math.max(0.6, 1 - 0.012 * (d - 1)),
    hpScale,
    moles,
    goldMult: 1,
    damage: 1,
    meterGain: 1,
    abilities: { quake: 0, trap: 0, freeze: 0, frenzy: 0 },
    decoyShields: 0,
    goldenShields: 0,
    hardHats: 0,
    boss: bossShift ? layer.boss : null,
    bossAtMs: 20_000,
    bossHp: Math.max(1, Math.round(MOLES[layer.boss].hp * hpScale)),
  };
}

// Hp of an ordinary mole at this config's depth.
export const moleHp = (kind: string, cfg: ShiftConfig): number => Math.max(1, Math.round(MOLES[kind].hp * cfg.hpScale));
