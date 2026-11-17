import type { BoardEntry, LeaderboardService, Submission, SubmitResult } from '../../meta/leaderboard';

// Talks to the two functions in supabase/migrations over PostgREST, with plain fetch (no SDK).
// restUrl: `${SUPABASE_URL}/rest/v1`. key: the project's publishable key (sb_publishable_...), which is safe
// to ship in the app. It goes in the `apikey` header only: it is not a JWT, so never send it as a Bearer token.
export function createSupabaseLeaderboard(restUrl: string, key: string, fetchImpl: typeof fetch = fetch): LeaderboardService {
  const call = (fn: string, body: object) =>
    fetchImpl(`${restUrl.replace(/\/$/, '')}/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  return {
    online: true,
    async submit(sub: Submission): Promise<SubmitResult> {
      try {
        const res = await call('submit_score', {
          p_run_id: sub.runId, p_player_id: sub.playerId, p_name: sub.name, p_day: sub.day, p_depth: sub.depth, p_elapsed_ms: sub.elapsedMs,
        });
        if (res.status >= 400 && res.status < 500) return 'rejected'; // malformed: retrying will not help
        if (!res.ok) return 'offline';
        const result: unknown = await res.json();
        return result === 'ok' || result === 'duplicate' || result === 'rejected' ? result : 'offline';
      } catch {
        return 'offline';
      }
    },
    async top(day, playerId, limit = 10): Promise<BoardEntry[] | null> {
      try {
        const res = await call('top_scores', { p_day: day, p_player_id: playerId, p_limit: limit });
        if (!res.ok) return null;
        const rows: unknown = await res.json();
        if (!Array.isArray(rows)) return null;
        return rows.map((r) => ({ rank: Number(r.rank), name: String(r.name), depth: Number(r.depth), me: r.me === true }));
      } catch {
        return null;
      }
    },
  };
}
