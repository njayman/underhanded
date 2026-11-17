import { defaultSave, sanitizeSave, type Save } from './progression';
import { randomId } from '../rules/run';

const KEY = 'underhanded.save.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

// ponytail: localStorage. Fine on Android; iOS can evict WebView storage under pressure.
// Move to @capacitor/preferences before the iOS release, and to cloud save when that lands.
export function loadSave(store: Store = localStorage): Save {
  try {
    const text = store.getItem(KEY);
    return text ? sanitizeSave(JSON.parse(text)) : defaultSave();
  } catch {
    return defaultSave(); // unreadable or corrupt: start clean rather than crash at boot
  }
}

// Returns false if the write failed (storage full or blocked). The game keeps running on memory.
export function writeSave(save: Save, store: Store = localStorage): boolean {
  try {
    store.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

// The live save. Scenes read it with getSave() and replace it with setSave(), which also persists.
let current: Save | null = null;
export function getSave(): Save {
  if (current) return current;
  current = loadSave();
  if (!current.playerId) setSave({ ...current, playerId: randomId() }); // first launch: who you are on the leaderboard
  return current;
}
export function setSave(save: Save): void {
  current = save;
  if (!writeSave(save)) console.warn('underhanded: could not write save');
}
