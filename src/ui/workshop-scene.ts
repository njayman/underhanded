import * as Phaser from 'phaser';
import { ABILITIES, ABILITY, MAX_ABILITY_LEVEL } from '../data/abilities';
import { HAMMERS } from '../data/hammers';
import { LAYERS } from '../data/layers';
import { SKIN, SKINS } from '../data/skins';
import { UPGRADES } from '../data/upgrades';
import { HARD_HATS_PER_SHIFT } from '../meta/gear';
import { MAX_HARD_HATS, buyUpgrade, upgradeCost, upgradeLevel } from '../meta/progression';
import { HARD_HAT_COST, abilityCost, buyAbility, buyHammer, buyHardHat, equipHammer, equipSkin } from '../meta/shop';
import { getSave, setSave } from '../meta/storage';
import { sfx } from '../audio/sfx';
import { W, printPage } from '../art/paper';
import { drawHammerIcon } from '../game/hammer';
import { button, bought, header, listen, row, type Hit } from './widgets';

type Tab = 'hammers' | 'abilities' | 'supplies' | 'upgrades';
const TABS: [Tab, string][] = [['hammers', 'HAMMERS'], ['abilities', 'ABILITIES'], ['supplies', 'SUPPLIES'], ['upgrades', 'UPGRADES']];
const TAB = { y: 180, h: 70 };
const ROWS_Y = 272;

// Workshop: everything bought with gold earned in play. Real money never reaches this screen.
export class WorkshopScene extends Phaser.Scene {
  private tab: Tab = 'hammers';

  constructor() {
    super('workshop');
  }

  init(data: { tab?: Tab }): void {
    this.tab = data.tab ?? this.tab;
  }

  create(): void {
    const save = getSave();
    const page = printPage(this, LAYERS[save.arena % LAYERS.length], 1300);
    const hits: Hit[] = [];
    header(this, 'WORKSHOP', `BANK ${save.gold} GOLD`);
    const tw = (W - 72 - 3 * 8) / 4;
    TABS.forEach(([id, label], i) => {
      button(this, page, hits, 36 + i * (tw + 8), TAB.y, tw, TAB.h, label, id === this.tab ? 'A' : 'none', () => this.go(id), undefined, 26);
    });
    // Apply a purchase: save, sound, redraw.
    const act = (next: ReturnType<typeof getSave>) => {
      bought(this, next !== getSave());
      if (next !== getSave()) setSave(next);
      this.scene.restart({ tab: this.tab });
    };

    const h = 140;
    const y = (i: number) => ROWS_Y + i * (h + 10);
    if (this.tab === 'hammers') {
      HAMMERS.forEach((def, i) => {
        const owned = save.hammers.includes(def.id);
        const equipped = save.hammer === def.id;
        row(this, page, hits, y(i), h, {
          title: def.name,
          blurb: `${def.blurb} Damage ${def.damage}.`,
          tab: equipped ? 'IN HAND' : owned ? 'EQUIP' : `${def.cost}`,
          tabSub: owned ? undefined : 'GOLD',
          tabFill: equipped ? 'A' : owned || save.gold >= def.cost ? 'B' : 'none',
          iconW: 90,
          action: () => act(owned ? equipHammer(getSave(), def.id) : buyHammer(getSave(), def.id)),
        });
        drawHammerIcon(page.a, page.b, 36 + 60, y(i) + 50, def, equipped ? SKIN[save.skin] : undefined, 0.55);
      });
    } else if (this.tab === 'abilities') {
      ABILITIES.forEach((def, i) => {
        const level = save.abilities[def.id];
        const cost = abilityCost(save, def.id);
        const power = def.power[Math.max(1, level) - 1];
        const what = def.id === 'quake' || def.id === 'trap' ? `${power} damage` : `${power / 1000}s`;
        row(this, page, hits, y(i), h, {
          title: level ? def.name : `${def.name} (locked)`,
          blurb: `${def.blurb} ${ABILITY[def.id].charge} charge, ${what}.`,
          tab: cost === null ? 'MAX' : `${cost}`,
          tabSub: cost === null ? undefined : level ? 'LEVEL UP' : 'UNLOCK',
          tabFill: cost === null ? 'A' : save.gold >= cost ? 'B' : 'none',
          boxes: { level, max: MAX_ABILITY_LEVEL },
          action: () => act(buyAbility(getSave(), def.id)),
        });
      });
    } else if (this.tab === 'supplies') {
      row(this, page, hits, y(0), h, {
        title: `Hard hats  x${save.hardHats}`,
        blurb: `Each one absorbs a lost life. You carry up to ${HARD_HATS_PER_SHIFT} into a shift. Max ${MAX_HARD_HATS}.`,
        tab: save.hardHats >= MAX_HARD_HATS ? 'FULL' : `${HARD_HAT_COST}`,
        tabSub: save.hardHats >= MAX_HARD_HATS ? undefined : 'GOLD',
        tabFill: save.hardHats < MAX_HARD_HATS && save.gold >= HARD_HAT_COST ? 'B' : 'none',
        action: () => act(buyHardHat(getSave())),
      });
      // Cosmetic skins you own (from the Store or the season pass).
      const skins = ['', ...SKINS.map((s) => s.id).filter((id) => save.skins.includes(id))];
      skins.slice(0, 5).forEach((id, i) => {
        const on = save.skin === id;
        row(this, page, hits, y(i + 1), 110, {
          title: id ? `Skin: ${SKIN[id].name}` : 'No hammer skin',
          blurb: id ? 'Cosmetic. Changes how your hammer looks, nothing else.' : 'Plain hammer.',
          tab: on ? 'ON' : 'WEAR',
          tabFill: on ? 'A' : 'B',
          action: () => act(equipSkin(getSave(), id)),
        });
      });
    } else {
      Object.values(UPGRADES).forEach((def, i) => {
        const cost = upgradeCost(save, def.id);
        row(this, page, hits, y(i), h, {
          title: def.name,
          blurb: def.blurb,
          tab: cost === null ? 'MAX' : `${cost}`,
          tabSub: cost === null ? undefined : 'GOLD',
          tabFill: cost === null ? 'A' : save.gold >= cost ? 'B' : 'none',
          boxes: { level: upgradeLevel(save, def.id), max: def.maxLevel },
          action: () => act(buyUpgrade(getSave(), def.id)),
        });
      });
    }
    button(this, page, hits, 36, 1150, W - 72, 100, 'BACK TO THE OFFICE', 'none', () => {
      sfx.click();
      this.scene.start('office');
    }, undefined, 44);
    listen(this, hits);
  }

  private go(tab: Tab): void {
    sfx.click();
    this.scene.restart({ tab });
  }
}
