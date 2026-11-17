import * as Phaser from 'phaser';
import { LAYERS, PAPER } from '../data/layers';
import { UPGRADES } from '../data/upgrades';
import { buyUpgrade, dailyBest, upgradeCost, upgradeLevel } from '../meta/progression';
import { newDailyRun, utcDateKey } from '../rules/run';
import { CHEST_GOLD, afterChest, chestsLeft } from '../rules/ads';
import { ads, leaderboard } from '../services';
import { flush } from '../meta/leaderboard';
import { getSave, setSave } from '../meta/storage';
import { LETTERING, W, inkText, printPage } from '../art/paper';

const X = 48;
const ROW_W = W - 96;
const ROW_H = 126;
const TAB_W = 150; // price tab on the right of each row
const rowY = (i: number) => 290 + i * (ROW_H + 12);
const BOARD = { y: 984, h: 70 }; // leaderboard button, full width
const BTN = { y: 1070, h: 150, w: (ROW_W - 14) / 2 }; // CLOCK IN on the left, DAILY on the right
const DAILY_X = X + BTN.w + 14;
const CHEST = { x: 470, y: 140, w: W - 48 - 470, h: 90 }; // rewarded-ad gold chest, top right

// Send queued runs to the leaderboard. Fire and forget: only settled runs leave the queue,
// and the save is re-read after the await so nothing written meanwhile is lost.
let sending = false;
export async function sendPending(): Promise<void> {
  if (sending || getSave().pending.length === 0) return;
  sending = true;
  try {
    const settled = await flush(getSave().pending, leaderboard, utcDateKey(new Date()));
    if (settled.size) setSave({ ...getSave(), pending: getSave().pending.filter((p) => !settled.has(p.runId)) });
  } finally {
    sending = false;
  }
}

// Head Office: the screen between runs. Spend banked gold on permanent upgrades, then clock in.
// Everything here is bought with gold earned in play. No real-money path may ever reach this list.
export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
  }

  create(): void {
    void sendPending();
    const save = getSave();
    const { inkA, inkB } = LAYERS[0];
    const { a, b } = printPage(this, inkB, 250);
    const ids = Object.keys(UPGRADES);

    inkText(this, X, 50, 68, inkA, LETTERING).setText('UNDERHANDED');
    inkText(this, X, 146, 34, inkB).setText(`BANK ${save.gold} GOLD`);
    inkText(this, X, 192, 34, inkB).setText(save.bestDepth ? `DEEPEST DEPTH ${save.bestDepth}` : 'FIRST DAY ON THE JOB');

    a.lineStyle(6, inkA);
    // Gold chest: optional rewarded ad, fixed amount, a few per UTC day.
    const today = utcDateKey(new Date());
    const chests = chestsLeft(save.ads, today);
    a.strokeRect(CHEST.x, CHEST.y, CHEST.w, CHEST.h);
    if (chests) b.fillStyle(inkB).fillRect(CHEST.x, CHEST.y, 16, CHEST.h);
    inkText(this, CHEST.x + CHEST.w / 2 + 6, CHEST.y + 16, 19, inkA, LETTERING).setOrigin(0.5, 0).setText(chests ? `GOLD CHEST +${CHEST_GOLD}` : 'GOLD CHEST');
    inkText(this, CHEST.x + CHEST.w / 2 + 6, CHEST.y + 50, 16, inkB).setOrigin(0.5, 0).setText(chests ? `WATCH AD  ${chests} LEFT` : 'BACK TOMORROW');
    let busy = false;

    ids.forEach((id, i) => {
      const def = UPGRADES[id];
      const y = rowY(i);
      const level = upgradeLevel(save, id);
      const cost = upgradeCost(save, id);
      const affordable = cost !== null && cost <= save.gold;
      a.fillStyle(PAPER).fillRect(X, y, ROW_W, ROW_H); // bare paper: knock the halftone out of the row
      a.strokeRect(X, y, ROW_W, ROW_H);
      a.lineBetween(X + ROW_W - TAB_W, y, X + ROW_W - TAB_W, y + ROW_H);
      if (affordable) b.fillStyle(inkB).fillRect(X + ROW_W - TAB_W, y, TAB_W, ROW_H); // inked tab: you can buy this

      inkText(this, X + 22, y + 12, 36, inkA, LETTERING).setText(def.name.toUpperCase());
      inkText(this, X + 22, y + 60, 20, inkB).setText(def.blurb).setWordWrapWidth(ROW_W - TAB_W - 40);
      for (let k = 0; k < def.maxLevel; k++) {
        if (k < level) a.fillStyle(inkA).fillRect(X + 22 + k * 30, y + 96, 20, 20);
        else a.strokeRect(X + 22 + k * 30, y + 96, 20, 20);
      }
      const tabX = X + ROW_W - TAB_W / 2;
      const tabInk = affordable ? PAPER : cost === null ? inkA : inkB;
      inkText(this, tabX, y + 26, 40, tabInk, LETTERING).setOrigin(0.5, 0).setText(cost === null ? 'MAX' : `${cost}`);
      if (cost !== null) inkText(this, tabX, y + 78, 22, tabInk).setOrigin(0.5, 0).setText('GOLD');
    });

    a.fillStyle(PAPER).fillRect(X, BOARD.y, ROW_W, BOARD.h);
    a.strokeRect(X, BOARD.y, ROW_W, BOARD.h);
    b.fillStyle(inkB).fillRect(X, BOARD.y, 20, BOARD.h);
    inkText(this, W / 2, BOARD.y + BOARD.h / 2, 38, inkA, LETTERING).setOrigin(0.5).setText('LEADERBOARD');

    a.fillStyle(inkA).fillRect(X, BTN.y, BTN.w, BTN.h);
    inkText(this, X + BTN.w / 2, BTN.y + BTN.h / 2, 58, PAPER, LETTERING).setOrigin(0.5).setText('CLOCK IN');
    // Daily: one seed per UTC day, the same moles for everyone, upgrades switched off.
    const best = dailyBest(save, today);
    b.fillStyle(inkB).fillRect(DAILY_X, BTN.y, BTN.w, BTN.h);
    inkText(this, DAILY_X + BTN.w / 2, BTN.y + 52, 58, PAPER, LETTERING).setOrigin(0.5).setText('DAILY');
    inkText(this, DAILY_X + BTN.w / 2, BTN.y + 108, 20, PAPER).setOrigin(0.5).setText(best ? `${today}  BEST ${best}` : `${today}  NO UPGRADES`);

    const shownAt = performance.now();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (busy || performance.now() - shownAt < 350) return; // 350ms: the tap that left the results page
      if (chests && p.x >= CHEST.x && p.x <= CHEST.x + CHEST.w && p.y >= CHEST.y && p.y <= CHEST.y + CHEST.h) {
        busy = true;
        void ads.rewarded('gold_chest').then((earned) => {
          busy = false;
          const now = getSave();
          if (!earned || chestsLeft(now.ads, today) === 0) return;
          setSave({ ...now, gold: now.gold + CHEST_GOLD, ads: afterChest(now.ads, today) });
          this.scene.restart();
        });
        return;
      }
      if (p.x < X || p.x > X + ROW_W) return;
      if (p.y >= BOARD.y && p.y <= BOARD.y + BOARD.h) return void this.scene.start('board');
      if (p.y >= BTN.y && p.y <= BTN.y + BTN.h) {
        if (p.x <= X + BTN.w) return void this.scene.start('shift', {});
        if (p.x >= DAILY_X) return void this.scene.start('shift', { run: newDailyRun(new Date()) });
        return;
      }
      const i = ids.findIndex((_, k) => p.y >= rowY(k) && p.y <= rowY(k) + ROW_H);
      if (i < 0) return;
      const next = buyUpgrade(getSave(), ids[i]);
      if (next === getSave()) return void this.cameras.main.shake(90, 0.006); // cannot afford, or maxed
      setSave(next);
      this.scene.restart();
    });
  }
}
