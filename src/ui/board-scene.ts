import * as Phaser from 'phaser';
import { LAYERS } from '../data/layers';
import { playerName, type BoardEntry } from '../meta/leaderboard';
import { dailyBest } from '../meta/progression';
import { getSave } from '../meta/storage';
import { utcDateKey } from '../rules/run';
import { leaderboard } from '../services';
import { INK_A, INK_B, TITLE, NO_INK, W, inkText, printPage } from '../art/paper';
import { sendPending } from './office-scene';

const X = 48;
const ROW_W = W - 96;
const TABS = { y: 250, h: 80, w: (ROW_W - 14) / 2 };
const LIST_Y = 380;
const LINE = 64;
const BACK = { y: 1110, h: 110 };

// Leaderboard: today's daily board and the all-time board, best depth per player.
export class BoardScene extends Phaser.Scene {
  private tab: 'daily' | 'alltime' = 'daily';

  constructor() {
    super('board');
  }

  init(data: { tab?: 'daily' | 'alltime' }): void {
    this.tab = data.tab ?? 'daily';
  }

  create(): void {
    const save = getSave();
    const today = utcDateKey(new Date());
    const layer = LAYERS[0];
    const inkA = INK_A;
    const inkB = INK_B;
    const { k, a, b } = printPage(this, layer, 360);
    a.lineStyle(6, inkA);

    inkText(this, X, 50, 68, inkA, TITLE).setText('LEADERBOARD');
    inkText(this, X, 146, 28, inkB).setText(`YOU ARE ${playerName(save.playerId).toUpperCase()}`);
    const mine = this.tab === 'daily' ? dailyBest(save, today) : save.bestDepth;
    inkText(this, X, 186, 28, inkB).setText(mine ? `YOUR BEST: DEPTH ${mine}` : 'NO RUNS YET');

    (['daily', 'alltime'] as const).forEach((tab, i) => {
      const x = X + i * (TABS.w + 14);
      const on = tab === this.tab;
      if (on) a.fillStyle(inkA).fillRect(x, TABS.y, TABS.w, TABS.h);
      else a.strokeRect(x, TABS.y, TABS.w, TABS.h);
      inkText(this, x + TABS.w / 2, TABS.y + TABS.h / 2, 38, on ? NO_INK : inkA, TITLE).setOrigin(0.5).setText(tab === 'daily' ? `DAILY ${today.slice(5)}` : 'ALL-TIME');
    });

    k.fillStyle(NO_INK).fillRect(X, BACK.y, ROW_W, BACK.h);
    a.strokeRect(X, BACK.y, ROW_W, BACK.h);
    b.fillStyle(inkB).fillRect(X, BACK.y, 20, BACK.h);
    inkText(this, W / 2, BACK.y + BACK.h / 2, 52, inkA, TITLE).setOrigin(0.5).setText('BACK TO THE OFFICE');

    const status = inkText(this, W / 2, LIST_Y + 40, 26, inkB).setOrigin(0.5, 0).setAlign('center').setText('fetching the ledger...');
    void (async () => {
      await sendPending(); // so a run that just ended shows up
      const rows = await leaderboard.top(this.tab === 'daily' ? today : null, save.playerId, 10);
      if (!this.scene.isActive()) return; // left while loading
      status.setText(this.statusLine(rows));
      if (rows) this.drawRows(rows, inkA, inkB, a, b);
    })();

    const shownAt = performance.now();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (performance.now() - shownAt < 350 || p.x < X || p.x > X + ROW_W) return;
      if (p.y >= BACK.y && p.y <= BACK.y + BACK.h) return void this.scene.start('office');
      if (p.y >= TABS.y && p.y <= TABS.y + TABS.h) {
        const tab = p.x < X + TABS.w ? 'daily' : 'alltime';
        if (tab !== this.tab) this.scene.restart({ tab });
      }
    });
  }

  private statusLine(rows: BoardEntry[] | null): string {
    const local = leaderboard.online ? '' : 'LOCAL BOARD: THIS DEVICE ONLY\n(no server set up yet)';
    if (rows === null) return 'could not reach the leaderboard.\ntry again later.';
    if (rows.length === 0) return `${local}\n\nnobody on the board yet.`.trim();
    return local;
  }

  private drawRows(rows: BoardEntry[], inkA: number, inkB: number, a: Phaser.GameObjects.Graphics, b: Phaser.GameObjects.Graphics): void {
    const top = LIST_Y + (leaderboard.online ? 20 : 120);
    rows.forEach((row, i) => {
      const y = top + i * LINE;
      if (row.me) b.fillStyle(inkB).fillRect(X, y - 6, ROW_W, LINE - 8); // your row, inked
      const ink = row.me ? NO_INK : inkA;
      inkText(this, X + 20, y, 34, ink, TITLE).setText(`${row.rank}.`);
      inkText(this, X + 100, y + 4, 30, row.me ? NO_INK : inkB).setText(row.name.toUpperCase());
      inkText(this, X + ROW_W - 20, y, 34, ink, TITLE).setOrigin(1, 0).setText(`DEPTH ${row.depth}`);
    });
    a.lineBetween(X, top - 16, X + ROW_W, top - 16);
  }
}
