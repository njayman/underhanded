// Entry point: boots Phaser. Scenes live in src/game and src/ui.
import * as Phaser from 'phaser';
import { TOOLS } from './data/tools';
import { ShiftScene } from './game/shift-scene';
import { DraftScene } from './ui/draft-scene';
import { OfficeScene } from './ui/office-scene';
import { BoardScene } from './ui/board-scene';
import { WorkshopScene } from './ui/workshop-scene';
import { StoreScene } from './ui/store-scene';
import { SeasonScene } from './ui/season-scene';
import { getSave, setSave } from './meta/storage';
import { newRun, streamFor } from './rules/run';
import { draftOffer } from './rules/tools';
import { FilterRiso, W, H } from './art/paper';
import './art/fonts.css';
import { setMuted, unlockAudio } from './audio/sfx';

setMuted(getSave().muted);
window.addEventListener('pointerdown', unlockAudio); // browsers keep audio suspended until a tap

// Dev server only: /?depth=5&tools=gold-pan,day-off starts a shift there, &draft opens the draft screen,
// /?gold=500 sets the bank, &boss brings a boss in after 3 seconds, &meter starts with a full meter,
// &scene=workshop|store|season|board opens that screen. Production always opens Head Office.
const q = new URLSearchParams(import.meta.env.DEV ? location.search : '');
if (q.has('gold')) setSave({ ...getSave(), gold: Math.max(0, Math.floor(Number(q.get('gold'))) || 0) });
const run = newRun(Date.now());
run.depth = Math.max(1, Math.floor(Number(q.get('depth'))) || 1);
run.tools = q.get('tools')?.split(',').filter((id) => id in TOOLS) ?? [];
const draft = q.has('draft');

// Text renders with whatever font is ready, so wait for the bundled fonts (but never hang on them).
const fonts = ['40px Anton', '40px "Permanent Marker"', '400 20px "Courier Prime"', '700 20px "Courier Prime"'];
const fontsReady = Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3000))]);
const game = await fontsReady.then(() =>
  new Phaser.Game({
    type: Phaser.WEBGL, // the riso print filter is WebGL only
    width: W,
    height: H,
    backgroundColor: 0x000000, // a page with no ink; the riso filter prints it as paper
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true }, // all sound is synthesised in src/audio
    render: { renderNodes: { FilterRiso } as unknown as Phaser.Types.Core.RenderConfig['renderNodes'] }, // registers the riso shader pass
  }),
);
const shift = !draft && (q.has('depth') || q.has('tools'));
const only = q.get('scene');
game.scene.add('office', OfficeScene, !draft && !shift && !only);
game.scene.add('shift', ShiftScene, shift, { run });
game.scene.add('board', BoardScene, only === 'board');
game.scene.add('workshop', WorkshopScene, only === 'workshop');
game.scene.add('store', StoreScene, only === 'store');
game.scene.add('season', SeasonScene, only === 'season');
game.scene.add('draft', DraftScene, draft, draft ? { run, offer: draftOffer(run.tools, streamFor(run, 'draft')) } : undefined);
if (import.meta.env.DEV) Object.assign(window, { game }); // for poking at scenes from the console
console.log('underhanded boot');
