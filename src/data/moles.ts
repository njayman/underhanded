// Mole definitions. Add a mole by adding an entry here and a weight in a layer (src/data/layers.ts)
// or a depth unlock (EXTRA_MOLES in src/generation/depth.ts).
export interface MoleDef {
  id: string;
  hp: number; // hammer damage needed, before depth scaling
  upMs: number; // time above ground before it escapes
  gold: number; // gold for finishing it
  hitCostsLife: boolean; // decoy: bonking it costs a life and breaks the combo
  missCostsLife: boolean; // letting it escape costs a life and breaks the combo
  // Bosses only. A boss arrives late in an arena's last shift and stays until the whistle.
  boss?: true;
  name?: string; // announced when it arrives
  hopEveryHits?: number; // moves to another hole after this many hits
  hopEveryMs?: number; // moves to another hole on a timer
}

export const MOLES: Record<string, MoleDef> = {
  clerk: { id: 'clerk', hp: 2, upMs: 1350, gold: 1, hitCostsLife: false, missCostsLife: false },
  golden: { id: 'golden', hp: 1, upMs: 1000, gold: 5, hitCostsLife: false, missCostsLife: true },
  foreman: { id: 'foreman', hp: 1, upMs: 1400, gold: 0, hitCostsLife: true, missCostsLife: false },
  courier: { id: 'courier', hp: 1, upMs: 700, gold: 2, hitCostsLife: false, missCostsLife: false }, // fast, fragile
  auditor: { id: 'auditor', hp: 5, upMs: 2000, gold: 4, hitCostsLife: false, missCostsLife: false }, // armoured, slow
  // Bosses: one per layer (see `boss` in src/data/layers.ts). Not in any spawn weights.
  archivist: { id: 'archivist', boss: true, name: 'The Archivist', hp: 14, upMs: 0, gold: 25, hitCostsLife: false, missCostsLife: true },
  inspector: { id: 'inspector', boss: true, name: 'The Pipe Inspector', hp: 14, hopEveryHits: 2, upMs: 0, gold: 35, hitCostsLife: false, missCostsLife: true },
  treasurer: { id: 'treasurer', boss: true, name: 'The Treasurer', hp: 16, hopEveryHits: 1, upMs: 0, gold: 50, hitCostsLife: false, missCostsLife: true },
  diva: { id: 'diva', boss: true, name: 'The Diva', hp: 14, hopEveryMs: 1300, upMs: 0, gold: 40, hitCostsLife: false, missCostsLife: true },
};
