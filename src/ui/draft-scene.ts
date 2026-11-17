import * as Phaser from 'phaser';
import { PAPER } from '../data/layers';
import { TOOLS } from '../data/tools';
import { shiftConfigForDepth } from '../generation/depth';
import { streamFor, type Run } from '../rules/run';
import { draftOffer } from '../rules/tools';
import { ads } from '../services';
import { LETTERING, W, inkText, printPage } from '../art/paper';

const CARD_X = 60;
const CARD_W = W - 120;
const CARD_H = 250;
const cardY = (i: number) => 330 + i * 290;
const REROLL = { y: 1178, h: 76 };

// Between shifts: pick one of the offered tools, then descend.
// One optional reroll per draft by rewarded ad, never in daily runs (the daily board stays level).
export class DraftScene extends Phaser.Scene {
  private run!: Run;
  private offer: string[] = [];
  private rerolled = false;

  constructor() {
    super('draft');
  }

  init(data: { run: Run; offer: string[]; rerolled?: boolean }): void {
    this.run = data.run;
    this.offer = data.offer;
    this.rerolled = data.rerolled ?? false;
  }

  create(): void {
    const { inkA, inkB } = shiftConfigForDepth(this.run.depth).layer; // still on the cleared layer's inks
    const { a, b } = printPage(this, inkB, 280);
    inkText(this, 48, 60, 62, inkA, LETTERING).setText('PICK A TOOL');
    inkText(this, 48, 150, 34, inkB).setText(`DEPTH ${this.run.depth} CLEARED`);
    inkText(this, 48, 196, 34, inkB).setText(`GOLD ${this.run.gold}`);

    a.lineStyle(6, inkA);
    b.fillStyle(inkB);
    this.offer.forEach((id, i) => {
      const tool = TOOLS[id];
      const y = cardY(i);
      const have = this.run.tools.filter((t) => t === id).length;
      a.fillStyle(PAPER).fillRect(CARD_X, y, CARD_W, CARD_H); // bare paper: knock the halftone out of the card
      a.strokeRect(CARD_X, y, CARD_W, CARD_H);
      b.fillRect(CARD_X, y, 26, CARD_H);
      inkText(this, CARD_X + 54, y + 30, 44, inkA, LETTERING).setText(tool.name.toUpperCase());
      inkText(this, CARD_X + 54, y + 104, 28, inkB).setText(tool.blurb).setWordWrapWidth(CARD_W - 90);
      if (have) inkText(this, CARD_X + CARD_W - 20, y + 206, 24, inkA).setOrigin(1, 0).setText(`you have ${have}`);
    });

    const canReroll = !this.rerolled && !this.run.daily;
    if (canReroll) {
      a.fillStyle(PAPER).fillRect(CARD_X, REROLL.y, CARD_W, REROLL.h);
      a.strokeRect(CARD_X, REROLL.y, CARD_W, REROLL.h);
      b.fillRect(CARD_X, REROLL.y, 20, REROLL.h);
      inkText(this, W / 2, REROLL.y + REROLL.h / 2, 32, inkA, LETTERING).setOrigin(0.5).setText('WATCH AD: NEW TOOLS');
    }
    let busy = false;

    // Short guard so the tap that dismissed the results page cannot pick a card.
    const shownAt = performance.now();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (busy || performance.now() - shownAt < 350) return;
      if (canReroll && p.x >= CARD_X && p.x <= CARD_X + CARD_W && p.y >= REROLL.y && p.y <= REROLL.y + REROLL.h) {
        busy = true;
        void ads.rewarded('reroll_draft').then((earned) => {
          busy = false;
          if (!earned) return;
          const offer = draftOffer(this.run.tools, streamFor(this.run, 'reroll'), 3, this.offer);
          this.scene.restart({ run: this.run, offer, rerolled: true });
        });
        return;
      }
      const i = this.offer.findIndex((_, k) => p.x >= CARD_X && p.x <= CARD_X + CARD_W && p.y >= cardY(k) && p.y <= cardY(k) + CARD_H);
      if (i < 0) return;
      this.run.tools.push(this.offer[i]);
      this.run.depth += 1;
      this.scene.start('shift', { run: this.run });
    });
  }
}
