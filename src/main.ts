// Entry point: boots Phaser. Scenes live in src/game and src/ui.
import * as Phaser from 'phaser';
import { PAPER } from './data/layers';
import { TOOLS } from './data/tools';
import { ShiftScene } from './game/shift-scene';
import { DraftScene } from './ui/draft-scene';
import { OfficeScene } from './ui/office-scene';
import { BoardScene } from './ui/board-scene';
import { getSave, setSave } from './meta/storage';
import { newRun, streamFor } from './rules/run';
import { draftOffer } from './rules/tools';
import { W, H } from './art/paper';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  backgroundColor: PAPER,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
});

// Dev server only: /?depth=5&tools=gold-pan,day-off starts a shift there, &draft opens the draft screen,
// /?gold=500 sets the bank, &boss makes the boss arrive after 3 seconds. Production always opens Head Office.
const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
if (q.has('gold')) setSave({ ...getSave(), gold: Math.max(0, Math.floor(Number(q.get('gold'))) || 0) });
const run = newRun(Date.now());
run.depth = Math.max(1, Math.floor(Number(q.get('depth'))) || 1);
run.tools = q.get('tools')?.split(',').filter((id) => id in TOOLS) ?? [];
const draft = q.has('draft');
const shift = !draft && (q.has('depth') || q.has('tools'));
game.scene.add('office', OfficeScene, !draft && !shift);
game.scene.add('shift', ShiftScene, shift, { run });
game.scene.add('board', BoardScene, false);
game.scene.add('draft', DraftScene, draft, draft ? { run, offer: draftOffer(run.tools, streamFor(run, 'draft')) } : undefined);
if (import.meta.env.DEV) Object.assign(window, { game }); // for poking at scenes from the console
console.log('underhanded boot');
