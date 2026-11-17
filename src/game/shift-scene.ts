import * as Phaser from 'phaser';
import { PAPER } from '../data/layers';
import { MOLES } from '../data/moles';
import { TOOLS } from '../data/tools';
import { shiftConfigForDepth, type ShiftConfig } from '../generation/depth';
import { createShift, revive, tick, whack, type ActiveMole, type ShiftEvent, type ShiftState } from '../rules/shift';
import { afterShift } from '../rules/ads';
import { ads } from '../services';
import { applyMods, applyTools, draftOffer } from '../rules/tools';
import { bankShift, dailyBest, recordDaily, upgradeMods } from '../meta/progression';
import { getSave, setSave } from '../meta/storage';
import { queue, submissionFor } from '../meta/leaderboard';
import { newRun, streamFor, type Run } from '../rules/run';
import { mulberry32 } from '../rules/rng';
import { LETTERING, W, hex, inkText, printPage } from '../art/paper';

const COLS = 3;
const POP_MS = 90; // rise and duck time
const BOSS_SCALE = 1.25;
const STAMP_MS = 420; // how long a splat and its lettering stay on the page

// A stamped button on the results page.
interface Button { y: number; label: Phaser.GameObjects.Text; action: () => void }
const BTN = { x: 110, w: W - 220, h: 84 };

interface Stamp { x: number; y: number; ink: 'A' | 'B'; ageMs: number; seed: number }

// One shift. Started fresh for every shift with { run }; with no data it starts a new run.
export class ShiftScene extends Phaser.Scene {
  private run!: Run;
  private cfg!: ShiftConfig;
  private state!: ShiftState;
  private stamps: Stamp[] = [];
  private spawnRng!: () => number;
  private hopRng!: () => number;
  private overAt = 0; // wall-clock ms when the results page appeared
  private banked = 0; // this shift's gold already in the bank (a revived shift ends twice)
  private bonus = 0; // extra gold from the double-gold ad
  private counted = false; // this shift has been counted towards the interstitial cap
  private watchedAd = false; // a rewarded ad was watched on this results page: skip the interstitial
  private adBusy = false; // an ad is on screen: ignore taps
  private buttons: Button[] = [];

  private gA!: Phaser.GameObjects.Graphics;
  private gB!: Phaser.GameObjects.Graphics;
  private goldText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;

  constructor() {
    super('shift');
  }

  init(data: { run?: Run }): void {
    this.run = data.run ?? newRun(Date.now());
  }

  create(): void {
    // Daily runs ignore permanent upgrades: everyone starts level. Drafted tools still count.
    const base = applyMods(shiftConfigForDepth(this.run.depth), this.run.daily ? [] : upgradeMods(getSave()));
    this.spawnRng = streamFor(this.run, 'spawn');
    this.hopRng = streamFor(this.run, 'hop');
    this.cfg = applyTools(base, this.run.tools);
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('boss')) this.cfg.bossAtMs = this.cfg.durationMs - 3000;
    this.state = createShift(this.cfg);
    this.stamps = [];
    this.buttons = [];
    this.banked = this.bonus = 0;
    this.counted = this.watchedAd = this.adBusy = false;
    ads.shiftStarted(); // no ads until the shift is over
    const { inkA, inkB, name } = this.cfg.layer;
    ({ a: this.gA, b: this.gB } = printPage(this, inkB));

    inkText(this, 48, 60, 62, inkA, LETTERING).setText(name.toUpperCase());
    inkText(this, 48, 150, 34, inkB).setText(`${this.run.daily ? 'DAILY ' : ''}DEPTH ${this.run.depth}`);
    this.goldText = inkText(this, 48, 196, 34, inkB);
    this.timeText = inkText(this, W - 48, 150, 34, inkB).setOrigin(1, 0);
    const owned = [...new Set(this.run.tools)].map((id) => {
      const n = this.run.tools.filter((t) => t === id).length;
      return TOOLS[id].name + (n > 1 ? ` x${n}` : '');
    });
    inkText(this, 48, 318, 22, inkB)
      .setText(owned.length ? `TOOLS: ${owned.join(', ')}` : '')
      .setWordWrapWidth(W - 96);
    this.resultText = inkText(this, W / 2, 560, 96, inkA, LETTERING).setOrigin(0.5).setAngle(-6).setAlign('center').setDepth(10);
    this.promptText = inkText(this, W / 2, 760, 32, inkB).setOrigin(0.5).setAlign('center').setDepth(10);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
  }

  private holePos(i: number): { x: number; y: number } {
    return { x: 140 + (i % COLS) * 220, y: 620 + Math.floor(i / COLS) * 240 };
  }

  private onTap(x: number, y: number): void {
    if (this.state.result) {
      if (this.adBusy || performance.now() - this.overAt < 600) return; // 600ms: swallow taps aimed at moles
      const button = this.buttons.find((btn) => x >= BTN.x && x <= BTN.x + BTN.w && y >= btn.y && y <= btn.y + BTN.h);
      if (button) button.action();
      else void this.leaveResults();
      return;
    }
    // Hit area covers the hole and the mole standing above it. The boss is taller, so test it first.
    const inBox = (i: number, reach: number) => {
      const h = this.holePos(i);
      return Math.abs(x - h.x) < 105 && y > h.y - reach && y < h.y + 50;
    };
    const boss = this.state.holes.findIndex((m) => m && MOLES[m.kind].boss);
    const hole = boss >= 0 && inBox(boss, 290) ? boss : this.state.holes.findIndex((_, i) => inBox(i, 190));
    if (hole < 0) return;
    const step = whack(this.state, hole, this.cfg, this.hopRng);
    this.state = step.state;
    this.handle(step.events);
  }

  private handle(events: ShiftEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit') this.stamp(e.hole, 'B', MOLES[e.kind].boss ? 'FIRED!' : 'BONK');
      else if (e.type === 'bossHit') this.stamp(e.hole, 'B', 'BONK');
      else if (e.type === 'spawn' && MOLES[e.kind].boss) this.announce(MOLES[e.kind].name ?? 'THE BOSS');
      else if (e.type === 'decoy') this.stamp(e.hole, e.lifeLost ? 'A' : 'B', e.lifeLost ? 'OI!' : 'BOING', e.lifeLost);
      else if (e.type === 'escaped' && e.lifeLost) this.stamp(e.hole, 'A', 'GONE!', true);
      else if (e.type === 'escaped' && e.shielded) this.stamp(e.hole, 'B', 'NETTED');
      else if (e.type === 'over') this.showResult(e.result);
    }
  }

  // Stamped ink splat plus lettering. Appears at full strength, then is gone: no fades, no particles.
  private stamp(hole: number, ink: 'A' | 'B', word: string, lifeLost = false): void {
    const { x, y } = this.holePos(hole);
    this.stamps.push({ x, y: y - 80, ink, ageMs: 0, seed: (hole + 1) * 7919 + this.state.hits * 31 + this.state.lives });
    const colour = hex(ink === 'A' ? this.cfg.layer.inkB : this.cfg.layer.inkA);
    const label = this.add
      .text(x, y - 90, word, { fontFamily: LETTERING, fontSize: '64px', color: colour, stroke: hex(PAPER), strokeThickness: 8 })
      .setOrigin(0.5)
      .setAngle(((hole * 37) % 30) - 15)
      .setDepth(5);
    this.time.delayedCall(STAMP_MS, () => label.destroy());
    if (lifeLost) this.cameras.main.shake(140, 0.012);
  }

  // A boss walks in: its name is stamped across the page for a moment.
  private announce(name: string): void {
    const { inkB } = this.cfg.layer; // second ink: stays readable over mole bodies
    const label = this.add
      .text(W / 2, 452, name.toUpperCase(), { fontFamily: LETTERING, fontSize: '74px', color: hex(inkB), stroke: hex(PAPER), strokeThickness: 10 })
      .setOrigin(0.5)
      .setAngle(-4)
      .setDepth(6);
    if (label.width > W - 60) label.setScale((W - 60) / label.width);
    this.time.delayedCall(1500, () => label.destroy());
    this.cameras.main.shake(220, 0.01);
  }

  private showResult(result: 'cleared' | 'failed'): void {
    ads.shiftEnded();
    // Bank now, not on the next tap: quitting on this page must not lose the shift's gold.
    let save = bankShift(getSave(), this.state.gold - this.banked, this.run.depth);
    this.banked = this.state.gold;
    if (this.run.daily) save = recordDaily(save, this.run.daily, this.run.depth);
    // Sacked ends the run: queue it for the leaderboard (sent from Head Office). A revive and a later
    // sacking replace this entry, since it is keyed by run id.
    if (result === 'failed') save = { ...save, pending: queue(save.pending, submissionFor(this.run, save.playerId)) };
    if (!this.counted) save = { ...save, ads: afterShift(save.ads) };
    this.counted = true;
    setSave(save);

    // Rewarded ads: always the player's choice, never needed to progress.
    if (this.state.gold > 0 && this.bonus === 0) this.addButton(930, 'WATCH AD: DOUBLE GOLD', () => void this.doubleGold());
    // One revive per run, and none in daily runs: the daily board stays level.
    if (result === 'failed' && !this.run.revived && !this.run.daily) this.addButton(1040, 'WATCH AD: REVIVE', () => void this.reviveShift());
    this.renderResult();
    this.overAt = performance.now();
  }

  private renderResult(): void {
    const save = getSave();
    const total = this.run.gold + this.state.gold + this.bonus;
    const doubled = this.bonus ? ' (doubled)' : '';
    if (this.state.result === 'cleared') {
      this.resultText.setText('SHIFT\nCLEARED');
      this.promptText.setText(`gold this run: ${total}${doubled}\n\nTAP TO PICK A TOOL`);
    } else {
      this.resultText.setText('SACKED');
      const daily = this.run.daily ? `\ndaily best: depth ${dailyBest(save, this.run.daily)}` : '';
      this.promptText.setText(`reached depth ${this.run.depth}${daily}\ngold this run: ${total}${doubled}\nbank: ${save.gold}\n\nTAP FOR HEAD OFFICE`);
    }
  }

  private addButton(y: number, text: string, action: () => void): void {
    const label = inkText(this, W / 2, y + BTN.h / 2, 32, this.cfg.layer.inkA, LETTERING).setOrigin(0.5).setDepth(10).setText(text);
    this.buttons.push({ y, label, action });
  }

  private removeButton(text: string): void {
    this.buttons = this.buttons.filter((btn) => (btn.label.text === text ? (btn.label.destroy(), false) : true));
  }

  private async doubleGold(): Promise<void> {
    this.adBusy = true;
    const earned = await ads.rewarded('double_gold');
    this.adBusy = false;
    if (!earned) return;
    this.watchedAd = true;
    this.bonus = this.state.gold;
    setSave(bankShift(getSave(), this.bonus, this.run.depth));
    this.removeButton('WATCH AD: DOUBLE GOLD');
    this.renderResult();
  }

  private async reviveShift(): Promise<void> {
    this.adBusy = true;
    const earned = await ads.rewarded('revive');
    this.adBusy = false;
    if (!earned) return;
    this.run.revived = true;
    for (const btn of this.buttons) btn.label.destroy();
    this.buttons = [];
    this.resultText.setText('');
    this.promptText.setText('');
    this.state = revive(this.state);
    ads.shiftStarted();
  }

  // Leave the results page: maybe an interstitial (capped, and never after a rewarded ad), then on.
  private async leaveResults(): Promise<void> {
    this.adBusy = true;
    if (!this.watchedAd) await ads.interstitialIfDue('results');
    if (this.state.result === 'failed') return void this.scene.start('office');
    this.run.gold += this.state.gold + this.bonus;
    const offer = draftOffer(this.run.tools, streamFor(this.run, 'draft'));
    if (offer.length) return void this.scene.start('draft', { run: this.run, offer });
    this.run.depth += 1; // every tool maxed: straight down
    this.scene.start('shift', { run: this.run });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100); // a backgrounded tab must not fast-forward the shift
    if (!this.state.result) {
      this.run.elapsedMs += dt; // same clamped dt the rules see: the leaderboard checks depth against it
      const step = tick(this.state, dt, this.cfg, this.spawnRng, this.hopRng);
      this.state = step.state;
      this.handle(step.events);
    }
    for (const s of this.stamps) s.ageMs += dt;
    this.stamps = this.stamps.filter((s) => s.ageMs < STAMP_MS);
    this.draw();
  }

  private draw(): void {
    const { inkA, inkB } = this.cfg.layer;
    const a = this.gA.clear();
    const b = this.gB.clear();
    a.fillStyle(inkA);
    b.fillStyle(inkB);
    a.lineStyle(6, inkA);
    b.lineStyle(6, inkB);

    // HUD: shift timer bar and lives as bowler hats.
    const frac = this.state.timeLeftMs / this.cfg.durationMs;
    a.strokeRect(48, 262, W - 96, 22);
    b.fillRect(48, 262, (W - 96) * frac, 22);
    for (let i = 0; i < this.cfg.lives; i++) {
      const x = W - 70 - i * 64;
      if (i < this.state.lives) {
        a.fillRoundedRect(x - 18, 196, 36, 26, { tl: 16, tr: 16, bl: 0, br: 0 });
        a.fillRoundedRect(x - 28, 220, 56, 9, 4);
      } else a.strokeRoundedRect(x - 28, 220, 56, 9, 4);
    }
    this.goldText.setText(`GOLD ${this.run.gold + this.state.gold + this.bonus}`);
    this.timeText.setText(`${Math.ceil(this.state.timeLeftMs / 1000)}s`);

    if (this.state.result) {
      for (const btn of this.buttons) {
        a.fillStyle(PAPER).fillRect(BTN.x, btn.y, BTN.w, BTN.h);
        a.strokeRect(BTN.x, btn.y, BTN.w, BTN.h);
        b.fillRect(BTN.x, btn.y, 20, BTN.h);
      }
      return; // results page: lettering and buttons only
    }

    this.state.holes.forEach((mole, i) => {
      const { x, y } = this.holePos(i);
      a.fillEllipse(x, y, 200, 64);
      b.fillEllipse(x, y + 4, 164, 44);
      if (!mole) return;
      const pop = Math.min(1, mole.ageMs / POP_MS, (mole.upMs - mole.ageMs) / POP_MS);
      this.drawMole(mole, x, y, Math.max(0.05, pop));
    });

    for (const s of this.stamps) this.drawSplat(s);
  }

  // Moles are drawn from data id -> look. Body in one ink, hat and face overprinted in the other.
  private drawMole(mole: ActiveMole, x: number, y: number, pop: number): void {
    const { kind, ageMs } = mole;
    const boss = MOLES[kind].boss;
    const k = boss ? BOSS_SCALE : 1;
    const golden = kind === 'golden';
    const body = golden ? this.gB : this.gA;
    const face = golden ? this.gA : this.gB;
    const h = 160 * k * pop;
    const top = y - h;
    const r = Math.min(58 * k, h / 2);
    body.fillRoundedRect(x - 60 * k, top, 120 * k, h, { tl: r, tr: r, bl: 0, br: 0 });
    if (boss) {
      // Bonks left, as a bar under the hole.
      this.gA.strokeRect(x - 70, y + 44, 140, 18);
      this.gB.fillRect(x - 70, y + 44, (140 * mole.hp) / this.cfg.bossHp, 18);
    }
    if (pop < 0.7) return;

    face.fillCircle(x - 22 * k, top + 62 * k, 8 * k);
    face.fillCircle(x + 22 * k, top + 62 * k, 8 * k);
    face.fillEllipse(x, top + 84 * k, 24 * k, 14 * k);

    if (boss) {
      // ponytail: all four bosses share this look (top hat, monocle, moustache). Give each its own when art lands.
      face.fillRect(x - 44 * k, top - 58 * k, 88 * k, 68 * k);
      face.fillRoundedRect(x - 72 * k, top + 6 * k, 144 * k, 13 * k, 6);
      body.fillRect(x - 44 * k, top - 14 * k, 88 * k, 10 * k);
      face.strokeCircle(x + 22 * k, top + 62 * k, 18 * k);
      face.fillEllipse(x, top + 106 * k, 88 * k, 22 * k);
      return;
    }
    if (kind === 'foreman') {
      // Flat cap, striped band, moustache, angry brows: the decoy.
      face.fillRect(x - 52, top - 24, 104, 32);
      face.fillRoundedRect(x - 76, top + 6, 152, 13, 6);
      body.fillRect(x - 52, top - 12, 104, 9);
      face.fillEllipse(x, top + 104, 78, 20);
      face.fillTriangle(x - 40, top + 40, x - 8, top + 52, x - 40, top + 50);
      face.fillTriangle(x + 40, top + 40, x + 8, top + 52, x + 40, top + 50);
      return;
    }
    // Bowler hat.
    face.fillRoundedRect(x - 40, top - 36, 80, 46, { tl: 36, tr: 36, bl: 0, br: 0 });
    face.fillRoundedRect(x - 64, top + 6, 128, 13, 6);
    if (golden) {
      // Coin on the belly and stop-motion shine rays.
      face.fillCircle(x, top + 126, 20);
      const turn = Math.floor(ageMs / 140) * 0.26;
      for (let n = 0; n < 8; n++) {
        const ang = turn + (n * Math.PI) / 4;
        body.lineBetween(x + Math.cos(ang) * 92, top + 60 + Math.sin(ang) * 92, x + Math.cos(ang) * 122, top + 60 + Math.sin(ang) * 122);
      }
    } else face.fillRect(x + 36, top + 100, 36, 46); // ledger
  }

  private drawSplat(s: Stamp): void {
    const g = s.ink === 'A' ? this.gA : this.gB;
    const rng = mulberry32(s.seed);
    const scale = s.ageMs < 60 ? 1.18 : 1; // stamp lands, then settles
    g.fillCircle(s.x, s.y, 58 * scale);
    for (let k = 0; k < 9; k++) {
      const ang = rng() * Math.PI * 2;
      const dist = (48 + rng() * 34) * scale;
      g.fillCircle(s.x + Math.cos(ang) * dist, s.y + Math.sin(ang) * dist, 10 + rng() * 18);
    }
    for (let k = 0; k < 6; k++) {
      const ang = rng() * Math.PI * 2;
      const dist = (105 + rng() * 40) * scale;
      g.fillCircle(s.x + Math.cos(ang) * dist, s.y + Math.sin(ang) * dist, 3 + rng() * 6);
    }
  }
}
