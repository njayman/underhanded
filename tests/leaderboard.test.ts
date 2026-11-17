import { describe, it, expect } from 'vitest';
import { MAX_PENDING, acceptable, flush, playerName, queue, sanitizePending, submissionFor, type LeaderboardService, type Submission, type SubmitResult } from '../src/meta/leaderboard';
import { defaultSave, sanitizeSave } from '../src/meta/progression';
import { newDailyRun, newRun, randomId } from '../src/rules/run';
import { createLocalLeaderboard } from '../src/services/leaderboard/local-leaderboard';
import { createSupabaseLeaderboard } from '../src/services/leaderboard/supabase-leaderboard';

const TODAY = '2026-11-17';
const player = randomId();
const sub = (over: Partial<Submission> = {}): Submission => ({ runId: randomId(), playerId: player, name: 'Clerk 1234', day: null, depth: 3, elapsedMs: 120_000, ...over });
const memStore = () => {
  const data: Record<string, string> = {};
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe('ids and names', () => {
  it('randomId makes distinct uuid v4 strings', () => {
    const ids = new Set(Array.from({ length: 200 }, randomId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('each run gets its own id; a player keeps one clerk name', () => {
    expect(newRun(1).id).not.toBe(newRun(1).id);
    expect(playerName(player)).toBe(playerName(player));
    expect(playerName(player)).toMatch(/^Clerk \d{4}$/);
  });
  it('submissionFor takes depth, play time and board from the run', () => {
    const run = { ...newDailyRun(new Date(`${TODAY}T10:00:00Z`)), depth: 4, elapsedMs: 200_123.7 };
    expect(submissionFor(run, player)).toEqual({ runId: run.id, playerId: player, name: playerName(player), day: TODAY, depth: 4, elapsedMs: 200_123 });
  });
});

describe('acceptable mirrors the server rules', () => {
  it('depth N needs N-1 full shifts of play', () => {
    expect(acceptable(sub({ depth: 1, elapsedMs: 0 }), TODAY)).toBe(true);
    expect(acceptable(sub({ depth: 3, elapsedMs: 120_000 }), TODAY)).toBe(true);
    expect(acceptable(sub({ depth: 3, elapsedMs: 119_999 }), TODAY)).toBe(false);
  });
  it('a daily run only counts on its own UTC day', () => {
    expect(acceptable(sub({ day: TODAY, depth: 1, elapsedMs: 0 }), TODAY)).toBe(true);
    expect(acceptable(sub({ day: '2026-11-16', depth: 1, elapsedMs: 0 }), TODAY)).toBe(false);
  });
  it('rejects malformed values', () => {
    for (const bad of [{ depth: 0 }, { depth: 1.5 }, { elapsedMs: -1 }, { name: '' }, { name: 'x'.repeat(25) }, { runId: 'nope' }, { playerId: '' }])
      expect(acceptable(sub(bad), TODAY)).toBe(false);
  });
});

describe('queue and flush', () => {
  const service = (results: SubmitResult[]) => {
    const sent: Submission[] = [];
    const svc: LeaderboardService = { online: true, async submit(s) { sent.push(s); return results.shift() ?? 'ok'; }, async top() { return []; } };
    return { svc, sent };
  };
  it('queue replaces an earlier entry for the same run (revive, then sacked deeper)', () => {
    const first = sub({ depth: 2, elapsedMs: 70_000 });
    const later = { ...first, depth: 3, elapsedMs: 150_000 };
    expect(queue(queue([], first), later)).toEqual([later]);
  });
  it('queue keeps at most MAX_PENDING, newest last', () => {
    let pending: Submission[] = [];
    for (let i = 0; i < MAX_PENDING + 5; i++) pending = queue(pending, sub());
    expect(pending).toHaveLength(MAX_PENDING);
  });
  it('flush settles ok, duplicate and rejected; stops at the first offline and keeps the rest', async () => {
    const subs = [sub(), sub(), sub(), sub(), sub()];
    const { svc, sent } = service(['ok', 'duplicate', 'rejected', 'offline']);
    const settled = await flush(subs, svc, TODAY);
    expect([...settled]).toEqual(subs.slice(0, 3).map((s) => s.runId));
    expect(sent).toHaveLength(4); // the fifth was not attempted
  });
  it('flush drops submissions that can no longer be accepted, without sending them', async () => {
    const stale = sub({ day: '2026-11-16', depth: 1, elapsedMs: 0 });
    const { svc, sent } = service([]);
    expect([...(await flush([stale], svc, TODAY))]).toEqual([stale.runId]);
    expect(sent).toEqual([]);
  });
  it('a provider that throws counts as offline', async () => {
    const boom: LeaderboardService = { online: true, submit: async () => { throw new Error('net'); }, top: async () => null };
    expect((await flush([sub()], boom, TODAY)).size).toBe(0);
  });
});

describe('save', () => {
  it('playerId and pending survive a round trip and garbage is dropped', () => {
    const good = sub();
    const save = sanitizeSave({ playerId: player, pending: [good, { runId: 'x' }, null, { ...good, runId: randomId(), depth: 'deep' }, { ...good, runId: randomId(), day: 'today' }] });
    expect(save.playerId).toBe(player);
    expect(save.pending).toEqual([good]);
    expect(sanitizeSave({ playerId: 'me', pending: 'lots' })).toMatchObject({ playerId: '', pending: [] });
    expect(defaultSave()).toMatchObject({ playerId: '', pending: [] });
  });
  it('sanitizePending caps the list', () => {
    expect(sanitizePending(Array.from({ length: 50 }, () => sub()))).toHaveLength(MAX_PENDING);
  });
});

describe('local board', () => {
  it('applies the rules, one entry per run, best per player, and keeps the boards apart', async () => {
    const board = createLocalLeaderboard(memStore(), () => new Date(`${TODAY}T12:00:00Z`));
    const other = randomId();
    const a = sub({ depth: 2, elapsedMs: 60_000 });
    expect(await board.submit(a)).toBe('ok');
    expect(await board.submit(a)).toBe('duplicate');
    expect(await board.submit(sub({ depth: 9, elapsedMs: 0 }))).toBe('rejected');
    expect(await board.submit(sub({ depth: 4, elapsedMs: 180_000 }))).toBe('ok');
    expect(await board.submit(sub({ playerId: other, depth: 3, elapsedMs: 120_000 }))).toBe('ok');
    expect(await board.submit(sub({ day: TODAY, depth: 1, elapsedMs: 0 }))).toBe('ok');
    expect(await board.top(null, player)).toEqual([
      { rank: 1, name: 'Clerk 1234', depth: 4, me: true },
      { rank: 2, name: 'Clerk 1234', depth: 3, me: false },
    ]);
    expect(await board.top(TODAY, player)).toEqual([{ rank: 1, name: 'Clerk 1234', depth: 1, me: true }]);
  });
  it('corrupt storage reads as an empty board', async () => {
    const store = memStore();
    store.setItem('underhanded.localboard.v1', '{oops');
    expect(await createLocalLeaderboard(store).top(null, player)).toEqual([]);
  });
});

describe('supabase board (fake fetch)', () => {
  const fakeFetch = (status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []) =>
    (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;

  it('posts named arguments to the rpc endpoint with the publishable key in apikey only', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const board = createSupabaseLeaderboard('https://x.supabase.co/rest/v1/', 'anon-key', fakeFetch(200, 'ok', calls));
    const s = sub({ day: TODAY, depth: 2, elapsedMs: 61_000 });
    expect(await board.submit(s)).toBe('ok');
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/submit_score');
    expect(calls[0].init.headers).toEqual({ 'Content-Type': 'application/json', apikey: 'anon-key' }); // not a JWT: no Bearer
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ p_run_id: s.runId, p_player_id: s.playerId, p_name: s.name, p_day: TODAY, p_depth: 2, p_elapsed_ms: 61_000 });
  });
  it('maps responses: 4xx rejected, 5xx and junk offline', async () => {
    expect(await createSupabaseLeaderboard('u', 'k', fakeFetch(200, 'duplicate')).submit(sub())).toBe('duplicate');
    expect(await createSupabaseLeaderboard('u', 'k', fakeFetch(400, { code: '22P02' })).submit(sub())).toBe('rejected');
    expect(await createSupabaseLeaderboard('u', 'k', fakeFetch(503, {})).submit(sub())).toBe('offline');
    expect(await createSupabaseLeaderboard('u', 'k', fakeFetch(200, 'what')).submit(sub())).toBe('offline');
    const down = (async () => { throw new TypeError('network'); }) as unknown as typeof fetch;
    expect(await createSupabaseLeaderboard('u', 'k', down).submit(sub())).toBe('offline');
    expect(await createSupabaseLeaderboard('u', 'k', down).top(null, player)).toBeNull();
  });
  it('reads the board rows', async () => {
    const rows = [{ rank: 1, name: 'Clerk 1', depth: 5, me: false }, { rank: 2, name: 'Clerk 2', depth: 4, me: true }];
    expect(await createSupabaseLeaderboard('u', 'k', fakeFetch(200, rows)).top(null, player)).toEqual(rows);
    expect(await createSupabaseLeaderboard('u', 'k', fakeFetch(200, { not: 'rows' })).top(null, player)).toBeNull();
  });
});

// Against a real PostgREST + the migration. Skipped unless UH_LEADERBOARD_REST_URL is set, e.g.
// UH_LEADERBOARD_REST_URL=http://127.0.0.1:54330 npx vitest run tests/leaderboard.test.ts
const live = process.env.UH_LEADERBOARD_REST_URL;
describe.skipIf(!live)('live server', () => {
  it('accepts, deduplicates, rejects, and ranks', async () => {
    const board = createSupabaseLeaderboard(live!, process.env.UH_LEADERBOARD_KEY ?? 'none');
    const today = new Date().toISOString().slice(0, 10);
    const me = randomId();
    const run = sub({ playerId: me, depth: 6, elapsedMs: 300_000 });
    expect(await board.submit(run)).toBe('ok');
    expect(await board.submit(run)).toBe('duplicate');
    expect(await board.submit(sub({ playerId: me, depth: 7, elapsedMs: 300_000 }))).toBe('rejected');
    expect(await board.submit(sub({ playerId: me, day: today, depth: 2, elapsedMs: 60_000 }))).toBe('ok');
    const top = await board.top(null, me, 50);
    expect(top?.find((r) => r.me)).toMatchObject({ depth: 6 });
    expect((await board.top(today, me, 50))?.find((r) => r.me)).toMatchObject({ depth: 2 });
  });
});
