import * as Phaser from 'phaser';
import { HAMMER } from '../data/hammers';
import { LAYERS } from '../data/layers';
import { MOLES } from '../data/moles';
import { SKIN } from '../data/skins';
import { arenaName, arenaShifts, shiftsBefore } from '../generation/depth';
import { dailyBest } from '../meta/progression';
import { flush } from '../meta/leaderboard';
import { getSave, setSave } from '../meta/storage';
import { newDailyRun, newRun, utcDateKey } from '../rules/run';
import { CHEST_GOLD, afterChest, chestsLeft } from '../rules/ads';
import { ads, leaderboard } from '../services';
import { music, setMuted, sfx } from '../audio/sfx';
import { INK_A, INK_B, TITLE, W, inkText, printPage } from '../art/paper';
import { drawHammerIcon } from '../game/hammer';
import { button, card, listen, type Hit } from './widgets';

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

// Head Office: the hub between runs. Clock in at your arena checkpoint, play the daily, or spend gold.
export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
  }

  create(): void {
    void sendPending();
    music.stop();
    const save = getSave();
    const today = utcDateKey(new Date());
    const page = printPage(this, LAYERS[save.arena % LAYERS.length], 300);
    const { a, b } = page;
    const hits: Hit[] = [];

    inkText(this, 36, 22, 84, INK_A, TITLE).setText('UNDERHANDED');
    inkText(this, 36, 136, 28, INK_B).setText(`BANK ${save.gold} GOLD`);
    inkText(this, 36, 176, 22, INK_B).setText(`HARD HATS ${save.hardHats}   DEEPEST DEPTH ${save.bestDepth}`);
    button(this, page, hits, W - 196, 226, 160, 52, save.muted ? 'SOUND OFF' : 'SOUND ON', 'none', () => {
      setSave({ ...getSave(), muted: !getSave().muted });
      setMuted(getSave().muted);
      this.scene.restart();
    }, undefined, 24);

    // The checkpoint: where CLOCK IN starts.
    const arena = save.arena;
    const layer = LAYERS[arena % LAYERS.length];
    card(page, 36, 320, W - 72, 230);
    inkText(this, 60, 334, 20, INK_B).setText('YOUR CHECKPOINT');
    inkText(this, 60, 360, 54, INK_A, TITLE).setText(arenaName(arena).toUpperCase()).setWordWrapWidth(470);
    inkText(this, 60, 448, 20, INK_B).setText(`ARENA ${arena + 1} / ${arenaShifts(arena)} SHIFTS / STARTS AT DEPTH ${shiftsBefore(arena) + 1}`);
    inkText(this, 60, 478, 20, INK_B).setText(`BOSS: ${(MOLES[layer.boss].name ?? '').toUpperCase()}`);
    const hammer = HAMMER[save.hammer] ?? HAMMER.mallet;
    drawHammerIcon(a, b, W - 110, 372, hammer, SKIN[save.skin], 0.62);
    inkText(this, W - 110, 490, 16, INK_B).setOrigin(0.5).setText(`${hammer.name.toUpperCase()}\nDMG ${hammer.damage}`).setAlign('center');

    button(this, page, hits, 36, 572, W - 72, 140, 'CLOCK IN', 'A', () => {
      sfx.click();
      this.scene.start('shift', { run: { ...newRun(Date.now()), depth: shiftsBefore(getSave().arena) + 1 } });
    }, undefined, 84);
    const best = dailyBest(save, today);
    button(this, page, hits, 36, 728, W - 72, 104, 'DAILY RUN', 'B', () => {
      sfx.click();
      this.scene.start('shift', { run: newDailyRun(new Date()) });
    }, `${today}  /  ${best ? `TODAY'S BEST: DEPTH ${best}` : 'SAME MOLES FOR EVERYONE, SCALED TO YOUR GEAR'}`, 54);

    const grid = [
      ['WORKSHOP', 'hammers / abilities / supplies', 'workshop'],
      ['STORE', 'cosmetics / remove ads', 'store'],
      ['SEASON PASS', 'free and paid tracks', 'season'],
      ['LEADERBOARD', 'daily and all-time', 'board'],
    ] as const;
    grid.forEach(([label, sub, key], i) => {
      const x = 36 + (i % 2) * ((W - 72) / 2 + 8);
      const y = 850 + Math.floor(i / 2) * 140;
      button(this, page, hits, x, y, (W - 72) / 2 - 8, 124, label, 'none', () => {
        sfx.click();
        this.scene.start(key);
      }, sub, 40);
    });

    // Gold chest: optional rewarded ad, fixed amount, a few per UTC day.
    const chests = chestsLeft(save.ads, today);
    let busy = false;
    button(this, page, hits, 36, 1136, W - 72, 100, chests ? `GOLD CHEST +${CHEST_GOLD}` : 'GOLD CHEST', 'none', () => {
      if (busy || chestsLeft(getSave().ads, today) === 0) return sfx.deny();
      busy = true;
      void ads.rewarded('gold_chest').then((earned) => {
        busy = false;
        const now = getSave();
        if (!earned || chestsLeft(now.ads, today) === 0) return;
        setSave({ ...now, gold: now.gold + CHEST_GOLD, ads: afterChest(now.ads, today) });
        sfx.coin();
        this.scene.restart();
      });
    }, chests ? `WATCH AN AD / ${chests} LEFT TODAY` : 'BACK TOMORROW', 40);
    listen(this, hits);
  }
}
