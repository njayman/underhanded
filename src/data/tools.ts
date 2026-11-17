// Tools (relics) drafted between shifts. Add a tool by adding an entry: effects are data in `mods`,
// applied by src/rules/tools.ts. A new kind of effect needs a new field here and one line there.
// Do not add tools that shorten a shift: the leaderboard caps depth by elapsed time (60s per shift).
export interface ToolMods {
  lives?: number; // added
  decoyShields?: number; // added: foreman bonks forgiven per shift
  goldenShields?: number; // added: escaped golden moles forgiven per shift
  goldMult?: number; // multiplied
  upScale?: number; // multiplied: how long moles stay up
  spawnEvery?: number; // multiplied: gap between spawns
  weightMult?: Record<string, number>; // multiplied: mole id -> spawn weight
  damage?: number; // added to hammer damage
  meterGain?: number; // multiplied: combo meter charge per hit
}

export interface ToolDef {
  id: string;
  name: string;
  blurb: string;
  maxStacks: number;
  mods: ToolMods;
}

const tools: ToolDef[] = [
  { id: 'rubber-mallet', name: 'Rubber Mallet', blurb: 'The first foreman you bonk each shift just bounces. No life lost.', maxStacks: 2, mods: { decoyShields: 1 } },
  { id: 'union-thermos', name: 'Union Thermos', blurb: 'Start every shift with one more life.', maxStacks: 2, mods: { lives: 1 } },
  { id: 'gold-pan', name: 'Gold Pan', blurb: 'Half again as much gold from every bonk.', maxStacks: 3, mods: { goldMult: 1.5 } },
  { id: 'molasses-drip', name: 'Molasses Drip', blurb: 'Moles linger a fifth longer above ground.', maxStacks: 2, mods: { upScale: 1.2 } },
  { id: 'butterfly-net', name: 'Butterfly Net', blurb: 'The first golden mole to escape each shift costs nothing.', maxStacks: 2, mods: { goldenShields: 1 } },
  { id: 'lucky-ledger', name: 'Lucky Ledger', blurb: 'Twice the golden moles. Twice the gold, twice the risk.', maxStacks: 1, mods: { weightMult: { golden: 2 } } },
  { id: 'slow-memo', name: 'Slow Memo', blurb: 'Head office dawdles. Moles turn up less often.', maxStacks: 2, mods: { spawnEvery: 1.15 } },
  { id: 'day-off', name: "Foreman's Day Off", blurb: 'Half as many foremen on the floor.', maxStacks: 1, mods: { weightMult: { foreman: 0.5 } } },
  { id: 'lead-weight', name: 'Lead Weight', blurb: 'Taped to the hammer head. +1 damage.', maxStacks: 2, mods: { damage: 1 } },
  { id: 'espresso', name: 'Double Espresso', blurb: 'The combo meter charges half again as fast.', maxStacks: 2, mods: { meterGain: 1.5 } },
];

export const TOOLS: Record<string, ToolDef> = Object.fromEntries(tools.map((t) => [t.id, t]));
