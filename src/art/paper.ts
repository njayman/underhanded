import * as Phaser from 'phaser';
import { mulberry32 } from '../rules/rng';

export const W = 720;
export const H = 1280;
// ponytail: system fonts. LETTERING stands in for hand-drawn lettering; replace with a lettered sprite sheet.
export const LETTERING = 'Impact, "Arial Black", sans-serif';
export const LEDGER = '"Courier New", monospace';

const hex = (ink: number) => '#' + ink.toString(16).padStart(6, '0');

// ponytail: halftone and grain are tiled canvas textures, not the planned fragment shader.
// Swap for the shader (ink pair as two uniforms) when sprites replace the Graphics-drawn moles.
export function makeHalftone(scene: Phaser.Scene, key: string, ink: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const size = 18;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const ctx = tex.context;
  ctx.fillStyle = hex(ink);
  for (const [x, y] of [[4.5, 4.5], [13.5, 13.5]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
}

export function makeGrain(scene: Phaser.Scene, key: string): void {
  if (scene.textures.exists(key)) return;
  const size = 256;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const ctx = tex.context;
  const rng = mulberry32(1905);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = 'rgba(60,40,20,0.10)';
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
  tex.refresh();
}

// A printed page: halftone ground, one Graphics layer per ink, grain on top.
// The second ink overprints the first (multiply) and sits slightly off-register.
export function printPage(scene: Phaser.Scene, inkB: number, groundTop = 400) {
  makeGrain(scene, 'grain');
  makeHalftone(scene, 'dots', inkB);
  scene.add.tileSprite(0, groundTop, W, H - groundTop, 'dots').setOrigin(0).setAlpha(0.3);
  const a = scene.add.graphics();
  const b = scene.add.graphics().setPosition(4, 3).setBlendMode(Phaser.BlendModes.MULTIPLY);
  scene.add.tileSprite(0, 0, W, H, 'grain').setOrigin(0).setDepth(20);
  return { a, b };
}

export function inkText(scene: Phaser.Scene, x: number, y: number, size: number, ink: number, font = LEDGER) {
  return scene.add.text(x, y, '', { fontFamily: font, fontSize: `${size}px`, fontStyle: 'bold', color: hex(ink) });
}

export { hex };
