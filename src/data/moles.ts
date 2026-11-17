// Mole definitions. Add a mole by adding an entry here and a weight in a layer (src/data/layers.ts).
export interface MoleDef {
  id: string;
  upMs: number; // time above ground before it escapes
  gold: number; // gold for a hit
  hitCostsLife: boolean; // decoy: bonking it costs a life
  missCostsLife: boolean; // letting it escape costs a life
  // Bosses only. A boss arrives late in the shift, takes several bonks, and stays until the whistle.
  boss?: true;
  name?: string; // announced when it arrives
  hp?: number; // bonks to send it packing, before depth scaling
  hopEveryHits?: number; // moves to another hole after this many bonks
  hopEveryMs?: number; // moves to another hole on a timer
}

export const MOLES: Record<string, MoleDef> = {
  clerk: { id: 'clerk', upMs: 1100, gold: 1, hitCostsLife: false, missCostsLife: false },
  golden: { id: 'golden', upMs: 1000, gold: 5, hitCostsLife: false, missCostsLife: true },
  foreman: { id: 'foreman', upMs: 1300, gold: 0, hitCostsLife: true, missCostsLife: false },
  // Bosses: one per layer (see `boss` in src/data/layers.ts). Not in any layer's spawn weights.
  archivist: { id: 'archivist', boss: true, name: 'The Archivist', hp: 8, upMs: 0, gold: 15, hitCostsLife: false, missCostsLife: true },
  inspector: { id: 'inspector', boss: true, name: 'The Pipe Inspector', hp: 8, hopEveryHits: 2, upMs: 0, gold: 20, hitCostsLife: false, missCostsLife: true },
  treasurer: { id: 'treasurer', boss: true, name: 'The Treasurer', hp: 9, hopEveryHits: 1, upMs: 0, gold: 30, hitCostsLife: false, missCostsLife: true },
  diva: { id: 'diva', boss: true, name: 'The Diva', hp: 8, hopEveryMs: 1300, upMs: 0, gold: 25, hitCostsLife: false, missCostsLife: true },
};
