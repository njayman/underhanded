import * as Phaser from 'phaser';
import { PAPER } from '../data/layers';

export const W = 720;
export const H = 1280;

// Fonts are bundled in assets/fonts and loaded before the game boots (src/art/fonts.css, src/main.ts).
export const TITLE = 'Anton, Impact, sans-serif'; // headings and buttons
export const LETTERING = '"Permanent Marker", cursive'; // hand-lettered stamps: BONK, OI!, FIRED!
export const LEDGER = '"Courier Prime", "Courier New", monospace'; // typewritten body text

// How the riso look works. Scenes never paint colours: they draw ink COVERAGE into two channels,
// red = ink A and green = ink B, on a black page (no ink). The Riso filter on each camera then prints
// that onto paper with the layer's two inks: tints become halftone dots, ink B is offset slightly
// (misregistration), overlaps multiply (overprint) and grain is added. Changing the ink pair is two
// uniforms. Draw ink with INK_A / INK_B; knock ink out (bare paper) with NO_INK on the `k` layer.
export const INK_A = 0xff0000;
export const INK_B = 0x00ff00;
export const NO_INK = 0x000000;

export const css = (color: number): string => '#' + color.toString(16).padStart(6, '0');
const rgb = (color: number): [number, number, number] => [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];

const FRAG = `
#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 resolution;
uniform vec3 inkA;
uniform vec3 inkB;
uniform vec3 paper;
uniform vec2 misregister;
uniform float dotSize;
varying vec2 outTexCoord;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Amplitude-modulated halftone: a dot per screen cell whose area matches the ink coverage.
float screen(vec2 px, float angle, float cover) {
  if (cover > 0.8) return 1.0; // near-solid prints solid: keeps thin text and antialiased edges crisp
  if (cover < 0.03) return 0.0;
  float s = sin(angle);
  float c = cos(angle);
  vec2 cell = fract(mat2(c, -s, s, c) * px / dotSize) - 0.5;
  float r = sqrt(cover / 3.14159);
  return 1.0 - smoothstep(r - 0.07, r + 0.07, length(cell));
}

void main() {
  vec2 px = outTexCoord * resolution;
  float a = texture2D(uMainSampler, outTexCoord).r;
  float b = texture2D(uMainSampler, outTexCoord - misregister / resolution).g;
  float grain = hash(floor(px));
  float ha = screen(px, 0.2618, a) * (0.86 + 0.14 * grain);
  float hb = screen(px + 3.0, 1.309, b) * (0.84 + 0.16 * hash(floor(px) + 17.0));
  vec3 color = paper * (0.965 + 0.035 * hash(floor(px * 0.5) + 5.0));
  color *= mix(vec3(1.0), inkA, ha);
  color *= mix(vec3(1.0), inkB, hb);
  gl_FragColor = vec4(color, 1.0);
}
`;

// Filter controller: holds the uniforms for one camera.
export class Riso extends Phaser.Filters.Controller {
  inkA: number[];
  inkB: number[];
  paper = rgb(PAPER);
  misregister = [3, 2];
  dotSize = 7;

  constructor(camera: Phaser.Cameras.Scene2D.Camera, inkA: number, inkB: number) {
    super(camera, 'FilterRiso');
    this.inkA = rgb(inkA);
    this.inkB = rgb(inkB);
  }

  setInks(inkA: number, inkB: number): this {
    this.inkA = rgb(inkA);
    this.inkB = rgb(inkB);
    return this;
  }
}

// Render node: the shader pass. Registered in the game config (src/main.ts) as 'FilterRiso'.
export class FilterRiso extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super('FilterRiso', manager, undefined, FRAG);
  }

  setupUniforms(controller: Riso, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const pm = this.programManager;
    pm.setUniform('resolution', [drawingContext.width, drawingContext.height]);
    pm.setUniform('inkA', controller.inkA);
    pm.setUniform('inkB', controller.inkB);
    pm.setUniform('paper', controller.paper);
    pm.setUniform('misregister', controller.misregister);
    pm.setUniform('dotSize', controller.dotSize);
  }
}

export interface Page {
  k: Phaser.GameObjects.Graphics; // knockouts: NO_INK fills that clear ink below (bare paper cards)
  a: Phaser.GameObjects.Graphics; // ink A, additive so it overprints ink B
  b: Phaser.GameObjects.Graphics; // ink B
  riso: Riso;
}

// Set a scene up for printing: black page, riso filter with the given inks, a halftone ground of ink B
// from groundTop down, then the knockout and ink layers in that order.
export function printPage(scene: Phaser.Scene, inks: { inkA: number; inkB: number }, groundTop = 400, groundTint = 0.3): Page {
  const camera = scene.cameras.main.setBackgroundColor(0x000000);
  const riso = new Riso(camera, inks.inkA, inks.inkB);
  camera.filters.internal.add(riso);
  if (groundTop < H) {
    scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).fillStyle(INK_B, groundTint).fillRect(0, groundTop, W, H - groundTop);
  }
  const k = scene.add.graphics();
  const a = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const b = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  return { k, a, b, riso };
}

// Text in one ink (additive, overprints) or NO_INK (knocked out of whatever ink is below it).
export function inkText(scene: Phaser.Scene, x: number, y: number, size: number, ink: number, font = LEDGER): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, '', { fontFamily: font, fontSize: `${size}px`, fontStyle: font === LEDGER ? 'bold' : 'normal', color: css(ink) })
    .setBlendMode(ink === NO_INK ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
}
