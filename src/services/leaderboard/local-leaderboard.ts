import { acceptable, type BoardEntry, type LeaderboardService, type Submission } from '../../meta/leaderboard';
import { utcDateKey } from '../../rules/run';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'underhanded.localboard.v1';

// Stand-in board when no server is configured: this device's runs only, same rules as the server.
export function createLocalLeaderboard(store: Store = localStorage, now = () => new Date()): LeaderboardService {
  const read = (): Submission[] => {
    try {
      const rows: unknown = JSON.parse(store.getItem(KEY) ?? '[]');
      return Array.isArray(rows) ? (rows as Submission[]) : [];
    } catch {
      return [];
    }
  };
  return {
    online: false,
    async submit(sub) {
      if (!acceptable(sub, utcDateKey(now()))) return 'rejected';
      const rows = read();
      if (rows.some((r) => r.runId === sub.runId)) return 'duplicate';
      try {
        store.setItem(KEY, JSON.stringify([...rows, sub].slice(-500)));
      } catch {
        return 'offline';
      }
      return 'ok';
    },
    async top(day, playerId, limit = 10): Promise<BoardEntry[]> {
      const best = new Map<string, Submission>();
      for (const r of read()) if (r.day === day && (best.get(r.playerId)?.depth ?? 0) < r.depth) best.set(r.playerId, r);
      return [...best.values()]
        .sort((a, b) => b.depth - a.depth)
        .slice(0, limit)
        .map((r, i) => ({ rank: i + 1, name: r.name, depth: r.depth, me: r.playerId === playerId }));
    },
  };
}
