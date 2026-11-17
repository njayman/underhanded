import type { AdService } from './ad-service';

// Stand-in ads you can see and tap, for playing the ad flow before a real SDK is installed.
// A plain DOM overlay on purpose: real ads are native views above the game, not Phaser scenes.
function overlay(title: string, note: string, buttons: [label: string, value: boolean][]): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'mock-ad';
    el.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:#1d1d1b;color:#f3ead3;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:24px;font:bold 22px "Courier New",monospace;text-align:center;padding:24px';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font:bold 40px Impact,"Arial Black",sans-serif';
    const p = document.createElement('div');
    p.textContent = note;
    el.append(h, p);
    for (const [label, value] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.value = String(value);
      b.style.cssText = 'font:inherit;padding:18px 28px;border:4px solid #f3ead3;background:none;color:inherit;min-width:260px';
      b.onclick = () => { el.remove(); resolve(value); };
      el.append(b);
    }
    document.body.append(el);
  });
}

export const overlayAdService: AdService = {
  showRewarded: (placement) =>
    overlay('MOCK REWARDED AD', `Stand-in for a real ad (${placement}). No ad SDK is installed.`, [
      ['WATCH TO THE END', true],
      ['CLOSE EARLY (NO REWARD)', false],
    ]),
  showInterstitial: (placement) =>
    overlay('MOCK INTERSTITIAL', `Stand-in for a real ad (${placement}). No ad SDK is installed.`, [['CLOSE', true]]),
};
