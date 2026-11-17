// Hammer skins: cosmetic only, they never change damage. Some are sold in the Store, some are season
// pass rewards (free and paid tracks). Drawing: see src/game/hammer.ts.
export interface SkinDef {
  id: string;
  name: string;
  pattern: 'stripes' | 'dots' | 'solid' | 'checks' | 'zigzag';
}

export const SKINS: SkinDef[] = [
  { id: 'stripes', name: 'Barber Pole', pattern: 'stripes' },
  { id: 'dots', name: 'Polka Proof', pattern: 'dots' },
  { id: 'gilded', name: 'Gilded Edition', pattern: 'solid' },
  { id: 'checks', name: 'Ledger Check', pattern: 'checks' }, // season free track
  { id: 'zigzag', name: 'Seismograph', pattern: 'zigzag' }, // season paid track
];

export const SKIN = Object.fromEntries(SKINS.map((s) => [s.id, s])) as Record<string, (typeof SKINS)[number]>;
