// Depth layers (departments). Add a layer by adding an entry; depth cycles through this list in order.
export interface LayerDef {
  id: string;
  name: string;
  inkA: number; // the two riso inks for this layer
  inkB: number;
  spawnEveryMs: number; // base spawn interval before depth scaling
  moles: Record<string, number>; // mole id -> spawn weight
  boss: string; // boss mole id, arrives near the end of each shift here
}

export const PAPER = 0xf3ead3;

export const LAYERS: LayerDef[] = [
  { id: 'fungus-archives', name: 'Fungus Archives', inkA: 0xe8503a, inkB: 0x1f8a8a, spawnEveryMs: 800, moles: { clerk: 8, golden: 1, foreman: 1 }, boss: 'archivist' },
  { id: 'pipe-works', name: 'Pipe Works', inkA: 0x2b4fa8, inkB: 0xf08a24, spawnEveryMs: 740, moles: { clerk: 7, golden: 1, foreman: 2 }, boss: 'inspector' },
  { id: 'gold-vault', name: 'Gold Vault', inkA: 0xe0a800, inkB: 0x2a2a3c, spawnEveryMs: 700, moles: { clerk: 6, golden: 2, foreman: 2 }, boss: 'treasurer' },
  { id: 'sewer-opera', name: 'Sewer Opera', inkA: 0x7a2f8f, inkB: 0x3a9a4a, spawnEveryMs: 660, moles: { clerk: 6, golden: 2, foreman: 3 }, boss: 'diva' },
];
