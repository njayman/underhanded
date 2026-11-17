import type * as Phaser from 'phaser';
import type { HammerDef } from '../data/hammers';
import type { SkinDef } from '../data/skins';
import { INK_A, INK_B, NO_INK } from '../art/paper';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };
const asPoints = (pts: Pt[]) => pts as unknown as Phaser.Math.Vector2[]; // Graphics only reads x and y

// A rotated rectangle as a polygon (Graphics has no rotated rect).
export function quad(g: G, cx: number, cy: number, w: number, h: number, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
  g.fillPoints(asPoints(pts), true);
}

const SWING_MS = 85; // head travels down
const HOLD_MS = 70; // rests on the mole, then vanishes (stamp logic: no fades)
export const SWING_TOTAL_MS = SWING_MS + HOLD_MS;
const REACH = 165; // grip to head centre

// Draw one hammer swing landing on (x, y), `ageMs` into the animation. Head in ink B (moles are mostly
// ink A, so the hammer reads over them), handle and band in ink A, all knocked out of whatever is below.
// `scale` grows the hammer during Frenzy.
export function drawSwing(k: G, a: G, b: G, x: number, y: number, ageMs: number, def: HammerDef, skin: SkinDef | undefined, scale = 1): void {
  const t = Math.min(1, ageMs / SWING_MS);
  const ease = t * t; // accelerates into the hit
  const grip = { x: x + 110 * scale, y: y + 175 * scale };
  const impact = Math.atan2(y - grip.y, x - grip.x);
  const angle = impact + (1 - ease) * 1.05; // raised to the right, then down onto the target
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = REACH * 1.2 * scale;
  const head = { x: grip.x + dx * reach, y: grip.y + dy * reach };
  const handleLen = reach - (def.head.h * scale) / 2;
  const w = def.head.w * 1.25 * scale;
  const h = def.head.h * 1.25 * scale;
  const hx = grip.x + (dx * handleLen) / 2;
  const hy = grip.y + (dy * handleLen) / 2;
  k.fillStyle(NO_INK);
  quad(k, hx, hy, handleLen, 22 * scale, angle);
  quad(k, head.x, head.y, h + 10, w + 10, angle);
  a.fillStyle(INK_A);
  quad(a, hx, hy, handleLen, 16 * scale, angle);
  b.fillStyle(INK_B);
  quad(b, head.x, head.y, h, w, angle);
  if (def.head.band) {
    a.fillStyle(INK_A);
    quad(a, head.x, head.y, h * 0.3, w, angle);
  }
  if (def.head.claw) {
    const px = -dy;
    const py = dx;
    a.fillStyle(INK_A);
    quad(a, head.x + px * (w / 2 + 12 * scale), head.y + py * (w / 2 + 12 * scale), h * 0.25, 26 * scale, angle);
  }
  if (def.head.spikes) {
    for (const side of [-1, 1]) {
      b.fillStyle(INK_B);
      quad(b, head.x + dx * side * (h / 2 + 9 * scale), head.y + dy * side * (h / 2 + 9 * scale), 12 * scale, w * 0.7, angle);
    }
  }
  if (skin) drawSkin(a, b, head.x, head.y, w, h, angle, skin);
}

// Skin patterns overprint the ink B head in ink A ('solid' covers it: both inks).
function drawSkin(a: G, b: G, cx: number, cy: number, w: number, h: number, angle: number, skin: SkinDef): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // local (u along the head's long side, v across it) to screen
  const at = (u: number, v: number) => ({ x: cx - u * s + v * c, y: cy + u * c + v * s });
  a.fillStyle(INK_A);
  if (skin.pattern === 'stripes') {
    for (let u = -w / 2 + 8; u < w / 2; u += 18) {
      const p = at(u, 0);
      quad(a, p.x, p.y, h, 7, angle + 0.5);
    }
  } else if (skin.pattern === 'dots') {
    for (let u = -w / 2 + 10; u < w / 2; u += 16) for (let v = -h / 2 + 9; v < h / 2; v += 16) {
      const p = at(u, v);
      a.fillCircle(p.x, p.y, 4);
    }
  } else if (skin.pattern === 'checks') {
    for (let i = 0, u = -w / 2; u < w / 2 - 1; u += 14, i++) for (let j = 0, v = -h / 2; v < h / 2 - 1; v += 14, j++) {
      if ((i + j) % 2) continue;
      const p = at(u + 7, v + 7);
      quad(a, p.x, p.y, 14, 14, angle);
    }
  } else if (skin.pattern === 'zigzag') {
    const pts: Pt[] = [];
    for (let u = -w / 2; u <= w / 2; u += 12) pts.push(at(u, (Math.round(u / 12) % 2 ? 1 : -1) * h * 0.3));
    a.lineStyle(6, INK_A).strokePoints(asPoints(pts));
  } else {
    quad(a, cx, cy, h, w, angle); // solid: both inks overprint the whole head
  }
}

// Draw a hammer at rest for shop rows: head up, handle down.
export function drawHammerIcon(a: G, b: G, x: number, y: number, def: HammerDef, skin: SkinDef | undefined, scale = 0.6): void {
  // A finished swing straight down: grip below, head above.
  const reach = REACH * scale;
  a.fillStyle(INK_A);
  quad(a, x, y + reach / 2, 12 * scale, reach, 0);
  b.fillStyle(INK_B);
  quad(b, x, y, def.head.w * scale, def.head.h * scale, 0);
  if (def.head.band) quad(a, x, y, def.head.w * scale, def.head.h * scale * 0.3, 0);
  if (def.head.claw) quad(a, x + (def.head.w * scale) / 2 + 6, y, 14 * scale, def.head.h * scale * 0.3, 0);
  if (skin) drawSkin(a, b, x, y, def.head.w * scale, def.head.h * scale, -Math.PI / 2, skin);
}
