import * as Phaser from 'phaser';
import { LAYERS } from '../data/layers';
import { PRODUCTS, PRODUCT } from '../data/store';
import { seasonNumber } from '../data/season';
import { grantProduct, passProduct, seasonOf } from '../meta/season';
import { getSave, setSave } from '../meta/storage';
import { purchases } from '../services';
import { sfx } from '../audio/sfx';
import { INK_B, W, inkText, printPage } from '../art/paper';
import { bought, button, header, listen, row, type Hit } from './widgets';

// Store: real-money products. Cosmetics, the starter pack, remove ads and the season pass only.
// Everything goes through `purchases` (src/services); this build uses stand-in purchases.
export class StoreScene extends Phaser.Scene {
  private owned = new Set<string>();

  constructor() {
    super('store');
  }

  create(): void {
    const save = getSave();
    const page = printPage(this, LAYERS[save.arena % LAYERS.length], 1300);
    const hits: Hit[] = [];
    header(this, 'STORE', 'COSMETICS AND CONVENIENCE. NEVER POWER.');
    inkText(this, 36, 172, 18, INK_B).setText('Test build: purchases are stand-ins, no money is charged.');
    const now = new Date();
    const pass = passProduct(now);
    const items = [...PRODUCTS.map((p) => p.id), pass];
    let busy = false;
    void Promise.all(items.map(async (id) => [id, await purchases.isOwned(id).catch(() => false)] as const)).then((rows) => {
      if (!this.scene.isActive()) return;
      this.owned = new Set(rows.filter(([, owned]) => owned).map(([id]) => id));
      items.forEach((id, i) => {
        const product = PRODUCT[id];
        const owned = this.owned.has(id);
        row(this, page, hits, 220 + i * 150, 140, {
          title: product ? product.name : `Season ${seasonNumber(seasonOf(now))} Pass`,
          blurb: product ? product.blurb : 'Opens the paid track this season: more gold, hard hats and exclusive skins. The free track stays complete.',
          tab: owned ? 'OWNED' : product?.price ?? '$4.99',
          tabFill: owned ? 'A' : 'B',
          action: () => {
            if (owned || busy) return sfx.deny();
            busy = true;
            void purchases.purchase(id).then((ok) => {
              busy = false;
              if (ok) setSave(grantProduct(getSave(), id)); // pays out once, even if the store reports it twice
              bought(this, ok);
              this.scene.restart();
            });
          },
        });
      });
    });
    button(this, page, hits, 36, 1150, W - 72, 100, 'BACK TO THE OFFICE', 'none', () => {
      sfx.click();
      this.scene.start('office');
    }, undefined, 44);
    listen(this, hits);
  }
}
