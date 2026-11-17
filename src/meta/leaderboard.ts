import { hashString } from '../rules/rng';
import type { Run } from '../rules/run';

// Leaderboard client logic, no I/O. Providers live in src/services/leaderboard.

export interface Submission {
  runId: string;
  playerId: string;
  name: string;
  day: string | null; // UTC date key for a daily run (daily board), null for an ordinary run (all-time board)
  depth: number;
  elapsedMs: number;
}

export type SubmitResult = 'ok' | 'duplicate' | 'rejected' | 'offline';
export interface BoardEntry { rank: number; name: string; depth: number; me: boolean }

// The game's interface to a leaderboard. Implementations: local (no server), Supabase.
export interface LeaderboardService {
  readonly online: boolean; // false: the local stand-in board, only this device's runs
  submit(sub: Submission): Promise<SubmitResult>;
  // Best depth per player, deepest first. day null: all-time. null result: the board could not be reached.
  top(day: string | null, playerId: string, limit?: number): Promise<BoardEntry[] | null>;
}

export const SHIFT_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// Until players can type a name: a stable clerk number per player.
export const playerName = (playerId: string): string => `Clerk ${1000 + (hashString(playerId) % 9000)}`;

export function submissionFor(run: Run, playerId: string): Submission {
  return { runId: run.id, playerId, name: playerName(playerId), day: run.daily, depth: run.depth, elapsedMs: Math.floor(run.elapsedMs) };
}

// The server's rules (supabase/migrations), checked before sending so doomed submissions are dropped.
export function acceptable(sub: Submission, today: string): boolean {
  if (sub.day !== null && sub.day !== today) return false; // a daily run only counts on its own UTC day
  if (!Number.isInteger(sub.depth) || sub.depth < 1 || !Number.isInteger(sub.elapsedMs) || sub.elapsedMs < 0) return false;
  if (sub.depth > Math.floor(sub.elapsedMs / SHIFT_MS) + 1) return false; // depth N needs N-1 full shifts
  return isUuid(sub.runId) && isUuid(sub.playerId) && sub.name.length >= 1 && sub.name.length <= 24;
}

export const MAX_PENDING = 20;

// Add or replace a run's submission. A revived run that is sacked again replaces its earlier entry.
export function queue(pending: Submission[], sub: Submission): Submission[] {
  return [...pending.filter((p) => p.runId !== sub.runId), sub].slice(-MAX_PENDING);
}

// Send what is queued. Returns the run ids that are settled (sent, already recorded, refused, or
// no longer valid) and can be dropped from the queue. Offline ones stay for next time.
export async function flush(pending: Submission[], service: LeaderboardService, today: string): Promise<Set<string>> {
  const settled = new Set<string>();
  for (const sub of pending) {
    if (!acceptable(sub, today)) {
      settled.add(sub.runId);
      continue;
    }
    const result = await service.submit(sub).catch((): SubmitResult => 'offline');
    if (result === 'offline') break; // no point hammering a dead connection
    settled.add(sub.runId);
  }
  return settled;
}

// Stored data is untrusted. Keep only well-formed submissions.
export function sanitizePending(raw: unknown): Submission[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .filter((r) => isUuid(r.runId) && isUuid(r.playerId) && typeof r.name === 'string')
    .filter((r) => r.day === null || (typeof r.day === 'string' && DATE_KEY.test(r.day)))
    .filter((r) => Number.isInteger(r.depth) && Number.isInteger(r.elapsedMs))
    .map((r) => ({ runId: r.runId as string, playerId: r.playerId as string, name: r.name as string, day: r.day as string | null, depth: r.depth as number, elapsedMs: r.elapsedMs as number }))
    .slice(-MAX_PENDING);
}
