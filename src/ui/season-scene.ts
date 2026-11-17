import * as Phaser from 'phaser';
import { LAYERS } from '../data/layers';
import { TIERS, TIER_XP, seasonNumber } from '../data/season';
import { claimTier, currentSeason, passProduct, seasonEnds, seasonOf, tierReached } from '../meta/season';
import { getSave, setSave } from '../meta/storage';
import { purchases } from '../services';
import { sfx } from '../audio/sfx';
import { INK_A, INK_B, NO_INK, TITLE, W, inkText, printPage } from '../art/paper';
import { bought, button, card, grantLabel, header, listen, type Hit } from './widgets';

const PER_PAGE = 6;
const ROW_H = 118;
const ROWS_Y = 300;

// Season pass: both tracks side by side from day one. Free on the left, paid on the right.
export class SeasonScene extends Phaser.Scene {
  private pageNo = 0;

  constructor() {
    super('season');
  }

  init(data: { page?: number }): void {
    this.pageNo = data.page ?? this.pageNo;
  }

  create(): void {
    const now = new Date();
    const save = currentSeason(getSave(), now);
    const page = printPage(this, LAYERS[save.arena % LAYERS.length], 1300);
    const { a, b } = page;
    const hits: Hit[] = [];
    const days = Math.ceil((seasonEnds(seasonOf(now)).getTime() - now.getTime()) / 86_400_000);
    const reached = tierReached(save);
    header(this, 'SEASON PASS', `SEASON ${seasonNumber(seasonOf(now))} / ENDS IN ${days} DAYS / TIER ${reached} OF ${TIERS.length}`);
    // Xp bar to the next tier.
    const into = save.season.xp % TIER_XP;
    a.lineStyle(4, INK_A).strokeRect(36, 176, W - 72, 22);
    b.fillStyle(INK_B).fillRect(39, 179, (W - 78) * (reached >= TIERS.length ? 1 : into / TIER_XP), 16);
    inkText(this, 36, 206, 17, INK_B).setText('10 XP per cleared shift, 25 per boss fired');
    inkText(this, 36 + (W - 72) * 0.25, 252, 26, INK_A, TITLE).setOrigin(0.5).setText('FREE');
    inkText(this, 36 + (W - 72) * 0.72, 252, 26, INK_A, TITLE).setOrigin(0.5).setText('PASS');

    void purchases.isOwned(passProduct(now)).catch(() => false).then((pass) => {
      if (!this.scene.isActive()) return;
      const first = this.pageNo * PER_PAGE;
      TIERS.slice(first, first + PER_PAGE).forEach((tier, i) => {
        const n = first + i + 1;
        const y = ROWS_Y + i * (ROW_H + 8);
        const open = n <= reached;
        inkText(this, 46, y + ROW_H / 2, 30, open ? INK_A : INK_B, TITLE).setOrigin(0, 0.5).setText(`${n}`);
        (['free', 'paid'] as const).forEach((track, t) => {
          const x = 96 + t * ((W - 132) / 2 + 4);
          const w = (W - 132) / 2 - 4;
          const claimed = save.season[track].includes(n);
          const ready = open && !claimed && (track === 'free' || pass);
          card(page, x, y, w, ROW_H);
          if (ready) a.fillStyle(INK_A).fillRect(x, y, w, ROW_H);
          const ink = ready ? NO_INK : INK_B;
          inkText(this, x + w / 2, y + 40, 18, ink).setOrigin(0.5).setAlign('center').setText(grantLabel(tier[track])).setWordWrapWidth(w - 20);
          inkText(this, x + w / 2, y + 88, 16, ready ? NO_INK : INK_A, TITLE).setOrigin(0.5).setText(claimed ? 'CLAIMED' : ready ? 'TAP TO CLAIM' : !open ? 'LOCKED' : 'NEEDS PASS');
          hits.push({ x, y, w, h: ROW_H, action: () => {
            const next = claimTier(getSave(), new Date(), n, track, pass);
            bought(this, next !== getSave());
            if (next !== getSave()) setSave(next);
            this.scene.restart({ page: this.pageNo });
          } });
        });
      });
    });

    const pages = Math.ceil(TIERS.length / PER_PAGE);
    const half = (W - 72 - 10) / 2;
    button(this, page, hits, 36, 1062, half, 70, 'PREV', 'none', () => this.turn(-1), undefined, 32);
    button(this, page, hits, 46 + half, 1062, half, 70, `NEXT  (${this.pageNo + 1}/${pages})`, 'none', () => this.turn(1), undefined, 32);
    button(this, page, hits, 36, 1150, W - 72, 100, 'BACK TO THE OFFICE', 'none', () => {
      sfx.click();
      this.scene.start('office');
    }, undefined, 44);
    if (save !== getSave()) setSave(save); // a new season started: store the reset
    listen(this, hits);
  }

  private turn(dir: number): void {
    const pages = Math.ceil(TIERS.length / PER_PAGE);
    sfx.click();
    this.scene.restart({ page: (this.pageNo + dir + pages) % pages });
  }
}
