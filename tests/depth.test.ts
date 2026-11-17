import { describe, it, expect } from 'vitest';
import { shiftConfigForDepth } from '../src/generation/depth';
import { LAYERS } from '../src/data/layers';
import { MOLES } from '../src/data/moles';

describe('shiftConfigForDepth', () => {
  it('is deterministic', () => {
    expect(shiftConfigForDepth(7)).toEqual(shiftConfigForDepth(7));
  });
  it('cycles layers in order, forever', () => {
    const n = LAYERS.length;
    for (let d = 1; d <= n * 3; d++) expect(shiftConfigForDepth(d).layer).toBe(LAYERS[(d - 1) % n]);
  });
  it('a revisited layer is faster than last time', () => {
    const first = shiftConfigForDepth(1), again = shiftConfigForDepth(1 + LAYERS.length);
    expect(again.layer).toBe(first.layer);
    expect(again.spawnEveryMs).toBeLessThan(first.spawnEveryMs);
    expect(again.upScale).toBeLessThan(first.upScale);
  });
  it('stays playable at absurd depth', () => {
    const c = shiftConfigForDepth(10_000);
    expect(c.spawnEveryMs).toBeGreaterThanOrEqual(260);
    expect(c.upScale).toBeGreaterThanOrEqual(0.5);
    expect(c).toMatchObject({ lives: 3, durationMs: 60_000 });
  });
  it('every layer only references defined moles', () => {
    for (const layer of LAYERS) for (const id of Object.keys(layer.moles)) expect(MOLES[id]).toBeDefined();
  });
});
