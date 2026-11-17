import type * as Phaser from 'phaser';
import { MOLES } from '../data/moles';
import type { ActiveMole } from '../rules/shift';
import { INK_A, INK_B, NO_INK } from '../art/paper';

type G = Phaser.GameObjects.Graphics;

export interface MoleLook {
  pop: number; // 0..1, how far out of the hole
  flinch: number; // 0..1, squash after taking a hit
  frozen: boolean;
}

// Draw a mole standing in the hole centred at (x, y). Two inks only: body in one, costume in the other.
// Every kind is drawn from data id -> look; add a case here when adding a mole to src/data/moles.ts.
// `k` is the knockout layer: the body is cut out of the halftone ground so it prints as solid ink.
export function drawMole(k0: G, a: G, b: G, mole: ActiveMole, x: number, y: number, look: MoleLook): void {
  const def = MOLES[mole.kind];
  const golden = mole.kind === 'golden';
  const body = golden ? b : a;
  const ink = golden ? a : b;
  const bodyInk = golden ? INK_B : INK_A;
  const costumeInk = golden ? INK_A : INK_B;
  body.fillStyle(bodyInk);
  ink.fillStyle(costumeInk);
  ink.lineStyle(5, costumeInk);

  const k = def.boss ? 1.25 : mole.kind === 'courier' ? 0.85 : mole.kind === 'auditor' ? 1.1 : 1;
  const squashW = 1 + look.flinch * 0.1;
  const squashH = 1 - look.flinch * 0.16;
  const w = 120 * k * squashW;
  const h = 160 * k * look.pop * squashH;
  const top = y - h;
  const r = Math.min(58 * k, h / 2);
  k0.fillStyle(NO_INK).fillRoundedRect(x - w / 2, top, w, h, { tl: r, tr: r, bl: 0, br: 0 });
  body.fillRoundedRect(x - w / 2, top, w, h, { tl: r, tr: r, bl: 0, br: 0 });

  // Hp bar for anything that takes more than one hit.
  if (mole.maxHp > 1 && look.pop > 0.6) {
    const bw = def.boss ? 150 : 96;
    const by = def.boss ? y + 44 : top - 58 * k;
    a.lineStyle(4, INK_A).strokeRect(x - bw / 2, by, bw, 14);
    b.fillStyle(INK_B).fillRect(x - bw / 2 + 3, by + 3, ((bw - 6) * Math.max(0, mole.hp)) / mole.maxHp, 8);
    body.fillStyle(bodyInk);
    ink.fillStyle(costumeInk);
  }
  if (look.pop < 0.7) return;

  const eyeY = top + 62 * k;
  const face = () => {
    ink.fillCircle(x - 22 * k, eyeY, 8 * k);
    ink.fillCircle(x + 22 * k, eyeY, 8 * k);
    ink.fillEllipse(x, top + 84 * k, 24 * k, 14 * k);
  };

  switch (mole.kind) {
    case 'foreman': // the decoy: flat cap, striped band, moustache, angry brows
      face();
      ink.fillRect(x - 52, top - 24, 104, 32);
      ink.fillRoundedRect(x - 76, top + 6, 152, 13, 6);
      body.fillRect(x - 52, top - 12, 104, 9);
      ink.fillEllipse(x, top + 104, 78, 20);
      ink.fillTriangle(x - 40, top + 40, x - 8, top + 52, x - 40, top + 50);
      ink.fillTriangle(x + 40, top + 40, x + 8, top + 52, x + 40, top + 50);
      break;
    case 'courier': // fast: forward cap, satchel strap, speed lines
      face();
      ink.fillRoundedRect(x - 36 * k, top - 22 * k, 72 * k, 34 * k, { tl: 30, tr: 30, bl: 0, br: 0 });
      ink.fillRoundedRect(x - 10 * k, top + 4 * k, 70 * k, 10 * k, 5);
      ink.lineBetween(x - 46 * k, top + 96 * k, x + 40 * k, top + 136 * k);
      ink.fillRect(x + 30 * k, top + 124 * k, 30 * k, 26 * k);
      for (const dy of [30, 60, 90]) body.fillRect(x - w / 2 - 34, top + dy * k, 22, 6);
      break;
    case 'auditor': // armoured: visor helmet, clipboard
      ink.fillRoundedRect(x - 52 * k, top - 18 * k, 104 * k, 60 * k, { tl: 44, tr: 44, bl: 6, br: 6 });
      body.fillRect(x - 40 * k, eyeY - 10 * k, 80 * k, 14 * k); // visor slit
      ink.fillEllipse(x, top + 90 * k, 26 * k, 12 * k);
      ink.fillRect(x - 70 * k, top + 96 * k, 40 * k, 52 * k);
      body.fillRect(x - 62 * k, top + 108 * k, 24 * k, 4);
      body.fillRect(x - 62 * k, top + 120 * k, 24 * k, 4);
      break;
    case 'archivist': // stack of files on the head, round spectacles, long beard
      for (let i = 0; i < 4; i++) ink.fillRect(x - 46 * k + (i % 2) * 10, top - 22 * k - i * 18 * k, 86 * k, 13 * k);
      ink.strokeCircle(x - 22 * k, eyeY, 17 * k);
      ink.strokeCircle(x + 22 * k, eyeY, 17 * k);
      ink.fillCircle(x - 22 * k, eyeY, 6 * k);
      ink.fillCircle(x + 22 * k, eyeY, 6 * k);
      ink.fillTriangle(x - 38 * k, top + 92 * k, x + 38 * k, top + 92 * k, x, top + 176 * k);
      break;
    case 'inspector': // hard hat with lamp, goggles, wrench
      ink.fillRoundedRect(x - 50 * k, top - 34 * k, 100 * k, 48 * k, { tl: 46, tr: 46, bl: 0, br: 0 });
      ink.fillRoundedRect(x - 70 * k, top + 6 * k, 140 * k, 12 * k, 6);
      body.fillCircle(x, top - 12 * k, 12 * k); // lamp: paper-coloured body ink shows through
      ink.strokeCircle(x - 22 * k, eyeY, 15 * k);
      ink.strokeCircle(x + 22 * k, eyeY, 15 * k);
      ink.lineBetween(x - 7 * k, eyeY, x + 7 * k, eyeY);
      ink.fillEllipse(x, top + 96 * k, 30 * k, 12 * k);
      ink.fillRect(x + 50 * k, top + 70 * k, 12 * k, 76 * k);
      ink.fillCircle(x + 56 * k, top + 68 * k, 16 * k);
      body.fillCircle(x + 56 * k, top + 62 * k, 7 * k);
      break;
    case 'treasurer': // top hat, monocle, waxed moustache, money bag
      face();
      ink.fillRect(x - 44 * k, top - 58 * k, 88 * k, 68 * k);
      ink.fillRoundedRect(x - 72 * k, top + 6 * k, 144 * k, 13 * k, 6);
      body.fillRect(x - 44 * k, top - 14 * k, 88 * k, 10 * k);
      ink.strokeCircle(x + 22 * k, eyeY, 18 * k);
      ink.fillEllipse(x, top + 106 * k, 88 * k, 22 * k);
      ink.fillCircle(x - 74 * k, top + 128 * k, 26 * k);
      ink.fillTriangle(x - 86 * k, top + 98 * k, x - 62 * k, top + 98 * k, x - 74 * k, top + 112 * k);
      break;
    case 'diva': // horned helmet, open singing mouth, notes in the air
      ink.fillRoundedRect(x - 54 * k, top - 22 * k, 108 * k, 44 * k, { tl: 50, tr: 50, bl: 0, br: 0 });
      ink.fillTriangle(x - 54 * k, top - 4 * k, x - 84 * k, top - 60 * k, x - 40 * k, top - 20 * k);
      ink.fillTriangle(x + 54 * k, top - 4 * k, x + 84 * k, top - 60 * k, x + 40 * k, top - 20 * k);
      ink.fillCircle(x - 22 * k, eyeY, 7 * k);
      ink.fillCircle(x + 22 * k, eyeY, 7 * k);
      ink.fillEllipse(x, top + 104 * k, 40 * k, 44 * k);
      for (const [nx, ny] of [[80, 20], [104, -20], [-96, 0]]) {
        ink.fillEllipse(x + nx * k, top + ny * k + Math.sin(mole.ageMs / 200 + nx) * 6, 16, 12);
        ink.fillRect(x + nx * k + 6, top + ny * k - 34 + Math.sin(mole.ageMs / 200 + nx) * 6, 4, 34);
      }
      break;
    default: {
      // clerk and golden: bowler hat
      face();
      ink.fillRoundedRect(x - 40, top - 36, 80, 46, { tl: 36, tr: 36, bl: 0, br: 0 });
      ink.fillRoundedRect(x - 64, top + 6, 128, 13, 6);
      if (golden) {
        ink.fillCircle(x, top + 126, 20);
        const turn = Math.floor(mole.ageMs / 140) * 0.26;
        body.lineStyle(6, bodyInk);
        for (let n = 0; n < 8; n++) {
          const ang = turn + (n * Math.PI) / 4;
          body.lineBetween(x + Math.cos(ang) * 92, top + 60 + Math.sin(ang) * 92, x + Math.cos(ang) * 122, top + 60 + Math.sin(ang) * 122);
        }
      } else ink.fillRect(x + 36, top + 100, 36, 46); // ledger
    }
  }

  if (look.frozen) {
    // Ice: an ink B outline and icicles under the chin.
    b.lineStyle(5, INK_B).strokeRoundedRect(x - w / 2 - 8, top - 10, w + 16, h + 6, { tl: r + 8, tr: r + 8, bl: 0, br: 0 });
    b.fillStyle(INK_B);
    for (let i = -2; i <= 2; i++) b.fillTriangle(x + i * 22 - 7, top + 112 * k, x + i * 22 + 7, top + 112 * k, x + i * 22, top + 136 * k);
  }
}

// Bear-trap jaws around a hole.
export function drawTrap(a: G, x: number, y: number): void {
  a.lineStyle(6, INK_A).strokeEllipse(x, y, 208, 72);
  a.fillStyle(INK_A);
  for (let i = 0; i < 9; i++) {
    const t = (i / 8) * Math.PI;
    const px = x + Math.cos(Math.PI + t) * 96;
    const py = y - 2 + Math.sin(Math.PI + t) * 30;
    a.fillTriangle(px - 8, py, px + 8, py, px, py - 18);
  }
}
