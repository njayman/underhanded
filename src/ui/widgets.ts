import * as Phaser from 'phaser';
import type { Grant } from '../data/store';
import { SKIN } from '../data/skins';
import { sfx } from '../audio/sfx';
import { INK_A, INK_B, LEDGER, NO_INK, TITLE, W, inkText, type Page } from '../art/paper';

// Shared menu pieces: printed buttons and rows on bare-paper cards, plus tap routing.

export interface Hit { x: number; y: number; w: number; h: number; action: () => void }

export type Fill = 'A' | 'B' | 'none';

// A printed button. 'A'/'B': solid ink with the label knocked out; 'none': paper card, ink A outline.
export function button(scene: Phaser.Scene, page: Page, hits: Hit[], x: number, y: number, w: number, h: number, label: string, fill: Fill, action: () => void, sub?: string, size = 46): void {
  const { k, a, b } = page;
  k.fillStyle(NO_INK).fillRect(x, y, w, h);
  if (fill === 'A') a.fillStyle(INK_A).fillRect(x, y, w, h);
  else if (fill === 'B') b.fillStyle(INK_B).fillRect(x, y, w, h);
  else {
    a.lineStyle(5, INK_A).strokeRect(x, y, w, h);
    b.fillStyle(INK_B).fillRect(x, y, 18, h);
  }
  const ink = fill === 'none' ? INK_A : NO_INK;
  const cy = sub ? y + h / 2 - 16 : y + h / 2;
  inkText(scene, x + w / 2 + (fill === 'none' ? 9 : 0), cy, size, ink, TITLE).setOrigin(0.5).setText(label);
  if (sub) inkText(scene, x + w / 2 + (fill === 'none' ? 9 : 0), y + h / 2 + 26, 17, fill === 'none' ? INK_B : NO_INK).setOrigin(0.5).setText(sub);
  hits.push({ x, y, w, h, action });
}

// A bare-paper card with an ink A outline, for list rows.
export function card(page: Page, x: number, y: number, w: number, h: number): void {
  page.k.fillStyle(NO_INK).fillRect(x, y, w, h);
  page.a.lineStyle(5, INK_A).strokeRect(x, y, w, h);
}

// A row: title, blurb, and a price/state tab on the right that is the tap target.
export interface RowSpec {
  title: string;
  blurb: string;
  tab: string; // e.g. "350", "MAX", "OWNED"
  tabSub?: string; // e.g. "GOLD"
  tabFill: Fill; // 'B' = available, 'A' = selected/equipped, 'none' = unavailable
  boxes?: { level: number; max: number };
  iconW?: number; // space reserved on the left for an icon
  action: () => void;
}

export const ROW = { x: 36, w: W - 72, tabW: 150 };

export function row(scene: Phaser.Scene, page: Page, hits: Hit[], y: number, h: number, spec: RowSpec): void {
  const { a, b } = page;
  card(page, ROW.x, y, ROW.w, h);
  const tabX = ROW.x + ROW.w - ROW.tabW;
  a.lineStyle(5, INK_A).lineBetween(tabX, y, tabX, y + h);
  if (spec.tabFill === 'A') a.fillStyle(INK_A).fillRect(tabX, y, ROW.tabW, h);
  if (spec.tabFill === 'B') b.fillStyle(INK_B).fillRect(tabX, y, ROW.tabW, h);
  const left = ROW.x + 20 + (spec.iconW ?? 0);
  inkText(scene, left, y + 10, 34, INK_A, TITLE).setText(spec.title.toUpperCase());
  inkText(scene, left, y + 58, 18, INK_B, LEDGER).setText(spec.blurb).setWordWrapWidth(tabX - left - 16);
  if (spec.boxes) {
    for (let i = 0; i < spec.boxes.max; i++) {
      if (i < spec.boxes.level) a.fillStyle(INK_A).fillRect(left + i * 28, y + h - 30, 20, 20);
      else a.lineStyle(4, INK_A).strokeRect(left + i * 28, y + h - 30, 20, 20);
    }
  }
  const tabInk = spec.tabFill === 'none' ? INK_A : NO_INK;
  inkText(scene, tabX + ROW.tabW / 2, y + h / 2 - (spec.tabSub ? 14 : 0), spec.tab.length > 6 ? 26 : 36, tabInk, TITLE).setOrigin(0.5).setText(spec.tab);
  if (spec.tabSub) inkText(scene, tabX + ROW.tabW / 2, y + h / 2 + 24, 16, tabInk === NO_INK ? NO_INK : INK_B).setOrigin(0.5).setText(spec.tabSub);
  hits.push({ x: tabX, y, w: ROW.tabW, h, action: spec.action });
}

// Route taps to hit boxes. Ignores taps for `guardMs` after the scene opens (the tap that opened it).
export function listen(scene: Phaser.Scene, hits: Hit[], guardMs = 300): void {
  const shownAt = performance.now();
  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (performance.now() - shownAt < guardMs) return;
    const hit = hits.find((h) => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
    if (hit) hit.action();
  });
}

// Screen header: big title, then a ledger line under it.
export function header(scene: Phaser.Scene, title: string, line: string): Phaser.GameObjects.Text {
  inkText(scene, 36, 30, 72, INK_A, TITLE).setText(title);
  return inkText(scene, 36, 132, 26, INK_B).setText(line);
}

export const grantLabel = (g: Grant): string =>
  [g.gold ? `+${g.gold} GOLD` : '', g.hardHats ? `${g.hardHats} HARD HAT${g.hardHats > 1 ? 'S' : ''}` : '', ...(g.skins ?? []).map((s) => `SKIN: ${SKIN[s]?.name ?? s}`)]
    .filter(Boolean)
    .join(' + ');

// Feedback for a purchase attempt: coin on success, buzz and a nudge when refused.
export function bought(scene: Phaser.Scene, ok: boolean): void {
  if (ok) sfx.coin();
  else {
    sfx.deny();
    scene.cameras.main.shake(90, 0.006);
  }
}
