import * as Phaser from 'phaser';
import { ABILITIES, METER_MAX, type AbilityId } from '../data/abilities';
import { HAMMER } from '../data/hammers';
import { MOLES } from '../data/moles';
import { XP_BOSS, XP_SHIFT } from '../data/season';
import { SKIN } from '../data/skins';
import { TOOLS } from '../data/tools';
import { arenaName, shiftConfigForDepth, type ShiftConfig } from '../generation/depth';
import { canUse, comboMult, createShift, revive, tick, useAbility, whack, type ShiftEvent, type ShiftState } from '../rules/shift';
import { afterShift } from '../rules/ads';
import { draftOffer } from '../rules/tools';
import { newRun, streamFor, type Run } from '../rules/run';
import { mulberry32 } from '../rules/rng';
import { applyGear, playerPower } from '../meta/gear';
import { bankShift, dailyBest, recordDaily } from '../meta/progression';
import { addSeasonXp } from '../meta/season';
import { getSave, setSave } from '../meta/storage';
import { queue, submissionFor } from '../meta/leaderboard';
import { ads } from '../services';
import { music, sfx } from '../audio/sfx';
import { H, INK_A, INK_B, LEDGER, LETTERING, NO_INK, TITLE, W, css, inkText, printPage, type Page } from '../art/paper';
import { drawSwing, SWING_TOTAL_MS } from './hammer';
import { drawMole, drawTrap } from './mole-art';

// Board layout (game space is 720x1280).
const COLS = 3;
const holePos = (i: number) => ({ x: 140 + (i % COLS) * 220, y: 560 + Math.floor(i / COLS) * 215 });
const GROUND_TOP = 330;
const METER = { x: 24, y: 1086, w: W - 48, h: 22 };
const ABIL = { x: 24, y: 1124, w: 156, h: 128, gap: 12 };
const abilityX = (i: number) => ABIL.x + i * (ABIL.w + ABIL.gap);
const RESULT_BTN = { x: 90, w: W - 180, h: 84 };

const POP_MS = 90; // rise and duck time
const FLINCH_MS = 140;
const STAMP_MS = 420; // splats and lettering stay this long, then are gone: no fades, no particles
const WORDS = ['BONK', 'WHAM', 'THWACK', 'SPLAT', 'CLONK'];
const COMBO_MILESTONES = [10, 25, 50, 100, 200, 400];

interface Stamp { x: number; y: number; ink: 'A' | 'B'; ageMs: number; seed: number; size: number }
interface Swing { x: number; y: number; ageMs: number }
interface Button { y: number; label: Phaser.GameObjects.Text; action: () => void }

// One shift. Started for every shift with { run }; with no data it starts a new run at depth 1.
export class ShiftScene extends Phaser.Scene {
  private run!: Run;
  private cfg!: ShiftConfig;
  private state!: ShiftState;
  private spawnRng!: () => number;
  private hopRng!: () => number;
  private page!: Page;

  private stamps: Stamp[] = [];
  private swings: Swing[] = [];
  private flinch: number[] = [];
  private armed: AbilityId | null = null; // Mole Trap waiting for a hole
  private quakeMs = 0; // cracks on the floor after a quake
  private shiftMs = 0; // shift time played (for Save.playedMs)
  private bankedMs = 0;
  private banked = 0; // this shift's gold already in the bank (a revived shift ends twice)
  private bonus = 0; // extra gold from the double-gold ad
  private bossFired = false;
  private xpShiftGiven = false;
  private xpBossGiven = false;
  private counted = false; // counted towards the interstitial cap
  private watchedAd = false;
  private adBusy = false;
  private overAt = 0;
  private buttons: Button[] = [];
  private lastMilestone = 0;

  private goldText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private hatsText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private abilityNames: Phaser.GameObjects.Text[] = [];
  private abilityInfo: Phaser.GameObjects.Text[] = [];
  private abilityKey = '';

  constructor() {
    super('shift');
  }

  init(data: { run?: Run }): void {
    this.run = data.run ?? newRun(Date.now());
  }

  create(): void {
    const save = getSave();
    // Daily runs use your gear but scale mole hp to it, so the daily board compares skill.
    const base = shiftConfigForDepth(this.run.depth, this.run.daily ? playerPower(save) : 1);
    this.cfg = applyGear(base, save, this.run.tools);
    const dev = new URLSearchParams(import.meta.env.DEV ? location.search : '');
    if (dev.has('boss')) Object.assign(this.cfg, { boss: this.cfg.layer.boss, bossAtMs: this.cfg.durationMs - 3000 });
    this.state = createShift(this.cfg);
    if (dev.has('meter')) this.state.meter = METER_MAX;
    this.spawnRng = streamFor(this.run, 'spawn');
    this.hopRng = streamFor(this.run, 'hop');
    // Phaser reuses this scene object for every shift: reset all per-shift state, including text lists.
    Object.assign(this, { abilityNames: [], abilityInfo: [], stamps: [], swings: [], buttons: [], armed: null, quakeMs: 0, shiftMs: 0, bankedMs: 0, banked: 0, bonus: 0, lastMilestone: 0, abilityKey: '' });
    Object.assign(this, { bossFired: false, xpShiftGiven: false, xpBossGiven: false, counted: false, watchedAd: false, adBusy: false });
    this.flinch = Array.from({ length: this.cfg.holes }, () => 0);

    this.page = printPage(this, this.cfg.layer, GROUND_TOP);
    const { arena, shiftInArena, arenaShifts, boss } = this.cfg;
    inkText(this, 36, 26, 58, INK_A, TITLE).setText(arenaName(arena).toUpperCase());
    inkText(this, 36, 104, 22, INK_B).setText(`${this.run.daily ? 'DAILY / ' : ''}ARENA ${arena + 1} / SHIFT ${shiftInArena + 1} OF ${arenaShifts}${boss ? ' / BOSS' : ''}`);
    inkText(this, W - 36, 104, 22, INK_B).setOrigin(1, 0).setText(`DEPTH ${this.run.depth}`);
    this.goldText = inkText(this, 36, 140, 30, INK_B);
    this.timeText = inkText(this, W - 36, 140, 30, INK_B).setOrigin(1, 0);
    this.hatsText = inkText(this, W - 36, 222, 18, INK_B).setOrigin(1, 0);
    this.comboText = inkText(this, W - 36, 262, 44, INK_A, TITLE).setOrigin(1, 0);
    this.multText = inkText(this, W - 120, 280, 18, INK_B).setOrigin(1, 0);
    const owned = [...new Set(this.run.tools)].map((id) => {
      const n = this.run.tools.filter((t) => t === id).length;
      return TOOLS[id].name + (n > 1 ? ` x${n}` : '');
    });
    inkText(this, 36, 270, 17, INK_B).setText(owned.length ? `TOOLS: ${owned.join(', ')}` : '').setWordWrapWidth(440);
    ABILITIES.forEach((def, i) => {
      this.abilityNames.push(inkText(this, abilityX(i) + ABIL.w / 2, ABIL.y + 34, 30, INK_A, TITLE).setOrigin(0.5).setDepth(5).setText(def.id.toUpperCase()));
      this.abilityInfo.push(inkText(this, abilityX(i) + ABIL.w / 2, ABIL.y + 84, 16, INK_B).setOrigin(0.5).setAlign('center').setDepth(5));
    });
    this.resultText = inkText(this, W / 2, 520, 104, INK_A, TITLE).setOrigin(0.5).setAngle(-5).setAlign('center').setDepth(10);
    this.statsText = inkText(this, W / 2, 700, 24, INK_B).setOrigin(0.5, 0).setAlign('center').setDepth(10);
    this.promptText = inkText(this, W / 2, 880, 26, INK_A).setOrigin(0.5).setAlign('center').setDepth(10);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p.x, p.y));
    ads.shiftStarted();
    music.start();
  }

  // ---- input ----

  private onTap(x: number, y: number): void {
    if (this.state.result) {
      if (this.adBusy || performance.now() - this.overAt < 600) return; // 600ms: swallow taps aimed at moles
      const button = this.buttons.find((btn) => x >= RESULT_BTN.x && x <= RESULT_BTN.x + RESULT_BTN.w && y >= btn.y && y <= btn.y + RESULT_BTN.h);
      if (button) button.action();
      else void this.leaveResults();
      return;
    }
    if (y >= ABIL.y) return this.tapAbility(x);
    const hole = this.holeAt(x, y);
    if (hole < 0) return;
    if (this.armed === 'trap') {
      this.armed = null;
      return this.apply(useAbility(this.state, 'trap', this.cfg, hole));
    }
    this.swings.push({ x, y: Math.min(y, holePos(hole).y - 40), ageMs: 0 });
    this.apply(whack(this.state, hole, this.cfg, this.hopRng));
  }

  private tapAbility(x: number): void {
    const i = ABILITIES.findIndex((_, k) => x >= abilityX(k) && x <= abilityX(k) + ABIL.w);
    if (i < 0) return;
    const id = ABILITIES[i].id;
    if (!canUse(this.state, id, this.cfg)) return sfx.deny();
    if (id === 'trap') {
      this.armed = this.armed === 'trap' ? null : 'trap';
      return sfx.click();
    }
    this.apply(useAbility(this.state, id, this.cfg));
  }

  // The hole under a tap: the boss's tall box first, then holes with a mole, then the nearest.
  private holeAt(x: number, y: number): number {
    const inBox = (i: number, reach: number) => {
      const h = holePos(i);
      return Math.abs(x - h.x) < 105 && y > h.y - reach && y < h.y + 50;
    };
    const boss = this.state.holes.findIndex((m) => m && MOLES[m.kind].boss);
    if (boss >= 0 && inBox(boss, 290)) return boss;
    const hits = this.state.holes.map((_, i) => i).filter((i) => inBox(i, 190));
    const occupied = hits.filter((i) => this.state.holes[i]);
    const pool = occupied.length ? occupied : hits;
    if (!pool.length) return -1;
    return pool.reduce((best, i) => (Math.abs(holePos(i).y - y) < Math.abs(holePos(best).y - y) ? i : best));
  }

  // ---- rules -> feedback ----

  private apply(step: { state: ShiftState; events: ShiftEvent[] }): void {
    this.state = step.state;
    this.handle(step.events);
  }

  private handle(events: ShiftEvent[]): void {
    for (const e of events) {
      if (e.type === 'spawn' && MOLES[e.kind].boss) {
        this.letter(W / 2, 452, (MOLES[e.kind].name ?? 'THE BOSS').toUpperCase(), 64, 'B', -4, 1500);
        this.cameras.main.shake(220, 0.01);
        sfx.bossIn();
      } else if (e.type === 'hit') {
        const { x, y } = holePos(e.hole);
        const boss = MOLES[e.kind].boss;
        const word = boss ? 'FIRED!' : e.cause === 'trap' ? 'SNAP!' : e.cause === 'quake' ? 'CRACK' : WORDS[(this.state.kills + e.hole) % WORDS.length];
        this.stamp(e.hole, 'B', word, boss ? 1.5 : 1);
        this.letter(x + 60, y - 170, `+${e.gold}`, 34, 'A', 6, 500, LEDGER);
        if (boss) {
          this.bossFired = true;
          this.cameras.main.shake(320, 0.02);
          sfx.bossDown();
        } else {
          this.cameras.main.shake(70, 0.004);
          if (e.kind === 'golden') sfx.golden();
          else if (e.cause === 'trap') sfx.ability('trapSnap');
          else sfx.bonk(this.cfg.damage);
        }
      } else if (e.type === 'hurt') {
        this.flinch[e.to] = FLINCH_MS;
        const { x, y } = holePos(e.to);
        this.letter(x - 50, y - 150, `-${e.damage}`, 26, 'A', -8, 300, LEDGER);
        sfx.hurt();
      } else if (e.type === 'decoy') {
        this.stamp(e.hole, e.lifeLost ? 'A' : 'B', e.lifeLost ? 'OI!' : 'BOING', 1);
        if (e.lifeLost) this.cameras.main.shake(140, 0.012);
        sfx.decoy();
      } else if (e.type === 'escaped' && e.lifeLost) {
        this.stamp(e.hole, 'A', 'GONE!', 1);
        this.cameras.main.shake(140, 0.012);
        sfx.lifeLost();
      } else if (e.type === 'escaped' && e.shielded) {
        this.stamp(e.hole, 'B', 'NETTED', 1);
      } else if (e.type === 'whiff') {
        sfx.whiff();
      } else if (e.type === 'comboBreak') {
        if (e.combo >= 5) this.letter(W / 2, 420, `COMBO BROKEN (x${e.combo})`, 40, 'A', 3, 700);
        if (e.combo >= 3) sfx.comboBreak();
        this.lastMilestone = 0;
      } else if (e.type === 'meterFull') {
        sfx.meterFull();
      } else if (e.type === 'hardHat') {
        this.letter(W / 2, 430, 'HARD HAT!', 60, 'B', -3, 700);
        sfx.shieldSaved();
        const save = getSave();
        setSave({ ...save, hardHats: Math.max(0, save.hardHats - 1) }); // used up, even if you quit now
      } else if (e.type === 'ability') {
        sfx.ability(e.id);
        if (e.id === 'quake') {
          this.quakeMs = 600;
          this.cameras.main.shake(500, 0.025);
          this.letter(W / 2, 430, 'QUAKE!', 84, 'A', -6, 600);
        } else if (e.id === 'freeze') this.letter(W / 2, 430, 'COLD SNAP', 72, 'B', 4, 800);
        else if (e.id === 'frenzy') this.letter(W / 2, 430, 'FRENZY!', 90, 'A', -5, 800);
      } else if (e.type === 'trapped') {
        this.stamp(e.hole, 'B', 'SNAP!', 1);
        sfx.ability('trapSnap');
      } else if (e.type === 'over') {
        this.showResult(e.result);
      }
    }
    // Combo milestones: big lettering, every time a new one is reached.
    const milestone = COMBO_MILESTONES.filter((m) => this.state.combo >= m).pop() ?? 0;
    if (milestone > this.lastMilestone) {
      this.letter(W / 2, 352, `x${milestone} COMBO!`, 70, 'A', -4, 700);
      sfx.meterFull();
    }
    this.lastMilestone = Math.max(this.lastMilestone, milestone);
  }

  // Stamped ink splat plus lettering on a hole.
  private stamp(hole: number, ink: 'A' | 'B', word: string, size: number): void {
    const { x, y } = holePos(hole);
    this.stamps.push({ x, y: y - 80, ink, ageMs: 0, seed: (hole + 1) * 7919 + this.state.kills * 31 + this.state.lives, size });
    this.letter(x, y - 90, word, 60 * size, ink === 'A' ? 'B' : 'A', ((hole * 37 + this.state.kills * 11) % 30) - 15, STAMP_MS);
  }

  // Hand-lettered word in one ink, knocked out of everything under it (a paper outline), then gone.
  private letter(x: number, y: number, text: string, size: number, ink: 'A' | 'B', angle: number, ms: number, font = LETTERING): void {
    const label = this.add
      .text(x, y, text, { fontFamily: font, fontSize: `${size}px`, fontStyle: font === LEDGER ? 'bold' : 'normal', color: css(ink === 'A' ? INK_A : INK_B), stroke: css(NO_INK), strokeThickness: size / 7 })
      .setOrigin(0.5)
      .setAngle(angle)
      .setDepth(8);
    if (label.width > W - 40) label.setScale((W - 40) / label.width);
    this.time.delayedCall(ms, () => label.destroy());
  }

  // ---- results ----

  private showResult(result: 'cleared' | 'failed'): void {
    ads.shiftEnded();
    music.stop();
    if (result === 'cleared') sfx.whistle();
    else sfx.sacked();
    this.armed = null;
    const now = new Date();
    // Bank now, not on the next tap: quitting on this page must not lose anything.
    let save = bankShift(getSave(), this.state.gold - this.banked, this.run.depth);
    this.banked = this.state.gold;
    save = { ...save, playedMs: save.playedMs + (this.shiftMs - this.bankedMs) };
    this.bankedMs = this.shiftMs;
    let xp = 0;
    if (result === 'cleared' && !this.xpShiftGiven) {
      xp += XP_SHIFT;
      this.xpShiftGiven = true;
    }
    if (this.bossFired && !this.xpBossGiven) {
      xp += XP_BOSS;
      this.xpBossGiven = true;
    }
    if (xp) save = addSeasonXp(save, now, xp);
    const arenaDone = result === 'cleared' && this.cfg.shiftInArena === this.cfg.arenaShifts - 1;
    if (arenaDone && !this.run.daily) save = { ...save, arena: Math.max(save.arena, this.cfg.arena + 1) }; // checkpoint
    if (this.run.daily) save = recordDaily(save, this.run.daily, this.run.depth);
    // Sacked ends the run: queue it for the leaderboard (sent from Head Office). Keyed by run id, so a
    // revive and a later sacking replace this entry.
    if (result === 'failed') save = { ...save, pending: queue(save.pending, submissionFor(this.run, save.playerId, save.playedMs)) };
    if (!this.counted) save = { ...save, ads: afterShift(save.ads) };
    this.counted = true;
    setSave(save);

    // Rewarded ads: always the player's choice, never needed to progress.
    if (this.state.gold > 0 && this.bonus === 0) this.addButton(1000, 'WATCH AD: DOUBLE GOLD', () => void this.doubleGold());
    // One revive per run, and none in daily runs: the daily board stays level.
    if (result === 'failed' && !this.run.revived && !this.run.daily) this.addButton(1110, 'WATCH AD: REVIVE', () => void this.reviveShift());
    this.renderResult();
    this.overAt = performance.now();
  }

  private renderResult(): void {
    const save = getSave();
    const total = this.run.gold + this.state.gold + this.bonus;
    const doubled = this.bonus ? ' (doubled)' : '';
    const stats = `${this.state.kills} moles / best combo x${this.state.bestCombo}\ngold this run: ${total}${doubled}`;
    if (this.state.result === 'cleared') {
      const arenaDone = this.cfg.shiftInArena === this.cfg.arenaShifts - 1;
      this.resultText.setText(arenaDone ? 'ARENA\nCLEARED' : 'SHIFT\nCLEARED');
      this.statsText.setText(arenaDone && !this.run.daily ? `${stats}\n\ncheckpoint: ${arenaName(this.cfg.arena + 1)}` : stats);
      this.promptText.setText('TAP TO PICK A TOOL');
    } else {
      this.resultText.setText('SACKED');
      const daily = this.run.daily ? `\ndaily best: depth ${dailyBest(save, this.run.daily)}` : `\nback to the start of ${arenaName(this.cfg.arena)}`;
      this.statsText.setText(`reached depth ${this.run.depth}${daily}\n${stats}\nbank: ${save.gold}`);
      this.promptText.setText('TAP FOR HEAD OFFICE');
    }
  }

  private addButton(y: number, text: string, action: () => void): void {
    const label = inkText(this, W / 2, y + RESULT_BTN.h / 2, 34, INK_A, TITLE).setOrigin(0.5).setDepth(10).setText(text);
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
    sfx.coin();
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
    for (const t of [this.resultText, this.statsText, this.promptText]) t.setText('');
    this.state = revive(this.state);
    ads.shiftStarted();
    music.start();
  }

  // Leave the results page: maybe an interstitial (capped, and never after a rewarded ad), then on.
  private async leaveResults(): Promise<void> {
    this.adBusy = true;
    sfx.click();
    if (!this.watchedAd) await ads.interstitialIfDue('results');
    if (this.state.result === 'failed') return void this.scene.start('office');
    this.run.gold += this.state.gold + this.bonus;
    const offer = draftOffer(this.run.tools, streamFor(this.run, 'draft'));
    if (offer.length) return void this.scene.start('draft', { run: this.run, offer });
    this.run.depth += 1; // every tool maxed: straight down
    this.scene.start('shift', { run: this.run });
  }

  // ---- frame ----

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100); // a backgrounded tab must not fast-forward the shift
    if (!this.state.result) {
      this.run.elapsedMs += dt; // same clamped dt the rules see: the leaderboard checks depth against it
      this.shiftMs += dt;
      this.apply(tick(this.state, dt, this.cfg, this.spawnRng, this.hopRng));
      const bossUp = this.state.holes.some((m) => m && MOLES[m.kind].boss);
      music.setLevel(bossUp || this.state.frenzyMs > 0 ? 2 : this.state.combo >= 10 ? 1 : 0);
    }
    for (const s of this.stamps) s.ageMs += dt;
    this.stamps = this.stamps.filter((s) => s.ageMs < STAMP_MS);
    for (const s of this.swings) s.ageMs += dt;
    this.swings = this.swings.filter((s) => s.ageMs < SWING_TOTAL_MS);
    this.flinch = this.flinch.map((f) => Math.max(0, f - dt));
    this.quakeMs = Math.max(0, this.quakeMs - dt);
    this.draw();
  }

  private draw(): void {
    const { k, a, b } = this.page;
    k.clear();
    a.clear();
    b.clear();
    const s = this.state;
    const cfg = this.cfg;

    // HUD: timer bar, lives as bowler hats, hard hats, gold and combo.
    a.lineStyle(5, INK_A).strokeRect(36, 196, W - 72, 20);
    b.fillStyle(INK_B).fillRect(39, 199, (W - 78) * (s.timeLeftMs / cfg.durationMs), 14);
    for (let i = 0; i < cfg.lives; i++) {
      const x = 60 + i * 56;
      if (i < s.lives) {
        a.fillStyle(INK_A).fillRoundedRect(x - 16, 230, 32, 22, { tl: 14, tr: 14, bl: 0, br: 0 });
        a.fillRoundedRect(x - 25, 250, 50, 8, 4);
      } else a.lineStyle(4, INK_A).strokeRoundedRect(x - 25, 250, 50, 8, 4);
    }
    this.goldText.setText(`GOLD ${this.run.gold + s.gold + this.bonus}`);
    this.timeText.setText(`${Math.ceil(s.timeLeftMs / 1000)}s`);
    this.hatsText.setText(s.hardHats ? `HARD HATS x${s.hardHats}` : '');
    this.comboText.setText(s.combo >= 2 ? `x${s.combo}` : '');
    this.multText.setText(comboMult(s.combo) > 1 ? `GOLD x${comboMult(s.combo).toFixed(1)}` : '');

    if (s.result) {
      // Results: a bare-paper panel over the board.
      k.fillStyle(NO_INK).fillRect(40, GROUND_TOP + 30, W - 80, H - GROUND_TOP - 60);
      a.lineStyle(6, INK_A).strokeRect(40, GROUND_TOP + 30, W - 80, H - GROUND_TOP - 60);
      for (const btn of this.buttons) {
        k.fillRect(RESULT_BTN.x, btn.y, RESULT_BTN.w, RESULT_BTN.h);
        a.strokeRect(RESULT_BTN.x, btn.y, RESULT_BTN.w, RESULT_BTN.h);
        b.fillStyle(INK_B).fillRect(RESULT_BTN.x, btn.y, 20, RESULT_BTN.h);
      }
      for (const label of [...this.abilityNames, ...this.abilityInfo]) label.setVisible(false);
      return;
    }

    // Board.
    if (s.frozenMs > 0) b.fillStyle(INK_B, 0.22).fillRect(0, GROUND_TOP, W, ABIL.y - GROUND_TOP - 50); // cold: denser dots
    if (this.quakeMs > 0) {
      a.lineStyle(5, INK_A);
      const rng = mulberry32(this.state.kills + 1);
      for (let c = 0; c < 6; c++) {
        let x = rng() * W;
        let y = GROUND_TOP + rng() * 600;
        for (let n = 0; n < 5; n++) {
          const nx = x + (rng() - 0.5) * 120;
          const ny = y + rng() * 80;
          a.lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
    }
    s.holes.forEach((mole, i) => {
      const { x, y } = holePos(i);
      k.fillStyle(NO_INK).fillEllipse(x, y, 204, 68);
      a.fillStyle(INK_A).fillEllipse(x, y, 200, 64);
      b.fillStyle(INK_B).fillEllipse(x, y + 4, 164, 44);
      if (s.traps[i]) drawTrap(a, x, y);
      if (this.armed === 'trap' && !s.traps[i]) b.lineStyle(4, INK_B).strokeEllipse(x, y, 226, 86);
      if (!mole) return;
      const pop = Math.max(0.05, Math.min(1, mole.ageMs / POP_MS, (mole.upMs - mole.ageMs) / POP_MS));
      drawMole(k, a, b, mole, x, y, { pop, flinch: this.flinch[i] / FLINCH_MS, frozen: s.frozenMs > 0 });
    });
    for (const st of this.stamps) this.drawSplat(st);
    const save = getSave();
    const hammer = HAMMER[save.hammer] ?? HAMMER.mallet;
    for (const sw of this.swings) drawSwing(k, a, b, sw.x, sw.y, sw.ageMs, hammer, SKIN[save.skin], s.frenzyMs > 0 ? 1.3 : 1);
    if (s.frenzyMs > 0 && Math.floor(s.frenzyMs / 120) % 2) a.lineStyle(14, INK_A).strokeRect(7, 7, W - 14, H - 14);

    // Combo meter: segments, solid ink A when full.
    const segW = METER.w / METER_MAX;
    k.fillStyle(NO_INK).fillRect(METER.x - 6, METER.y - 6, METER.w + 12, METER.h + 12);
    for (let i = 0; i < METER_MAX; i++) {
      const filled = i < Math.floor(s.meter);
      if (filled) (s.meter >= METER_MAX ? a.fillStyle(INK_A) : b.fillStyle(INK_B)).fillRect(METER.x + i * segW + 2, METER.y, segW - 4, METER.h);
    }
    a.lineStyle(3, INK_A).strokeRect(METER.x, METER.y, METER.w, METER.h);
    this.drawAbilities();
  }

  private drawAbilities(): void {
    const { k, a, b } = this.page;
    const key: string[] = [];
    ABILITIES.forEach((def, i) => {
      const x = abilityX(i);
      const level = this.cfg.abilities[def.id];
      const ready = canUse(this.state, def.id, this.cfg);
      const armed = this.armed === def.id;
      k.fillStyle(NO_INK).fillRect(x, ABIL.y, ABIL.w, ABIL.h);
      if (armed) b.fillStyle(INK_B).fillRect(x, ABIL.y, ABIL.w, ABIL.h);
      else if (ready) a.fillStyle(INK_A).fillRect(x, ABIL.y, ABIL.w, ABIL.h);
      else {
        // Charge progress as a tint rising from the bottom.
        const frac = level ? Math.min(1, this.state.meter / def.charge) : 0;
        b.fillStyle(INK_B, 0.35).fillRect(x, ABIL.y + ABIL.h * (1 - frac), ABIL.w, ABIL.h * frac);
      }
      a.lineStyle(5, INK_A).strokeRect(x, ABIL.y, ABIL.w, ABIL.h);
      const state = level === 0 ? 'locked' : armed ? 'armed' : ready ? 'ready' : 'charging';
      key.push(state);
      if (this.abilityKey.split(',')[i] === state) return;
      const name = this.abilityNames[i];
      const info = this.abilityInfo[i];
      const knocked = state === 'ready' || state === 'armed';
      name.setColor(css(knocked ? NO_INK : INK_A)).setBlendMode(knocked ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD).setAlpha(level ? 1 : 0.45);
      info.setColor(css(knocked ? NO_INK : INK_B)).setBlendMode(knocked ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
      info.setText(state === 'locked' ? 'LOCKED\nworkshop' : state === 'armed' ? 'TAP A\nHOLE' : `${def.charge} CHARGE\nLV ${level}`);
    });
    this.abilityKey = key.join(',');
  }

  private drawSplat(st: Stamp): void {
    const g = st.ink === 'A' ? this.page.a : this.page.b;
    g.fillStyle(st.ink === 'A' ? INK_A : INK_B);
    const rng = mulberry32(st.seed);
    const scale = (st.ageMs < 60 ? 1.18 : 1) * st.size; // stamp lands, then settles
    g.fillCircle(st.x, st.y, 58 * scale);
    for (let n = 0; n < 9; n++) {
      const ang = rng() * Math.PI * 2;
      const dist = (48 + rng() * 34) * scale;
      g.fillCircle(st.x + Math.cos(ang) * dist, st.y + Math.sin(ang) * dist, 10 + rng() * 18);
    }
    for (let n = 0; n < 6; n++) {
      const ang = rng() * Math.PI * 2;
      const dist = (105 + rng() * 40) * scale;
      g.fillCircle(st.x + Math.cos(ang) * dist, st.y + Math.sin(ang) * dist, 3 + rng() * 6);
    }
  }
}
