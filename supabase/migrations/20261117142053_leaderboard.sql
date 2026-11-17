-- Underhanded leaderboard. Apply with `supabase db push` (or paste into the SQL editor).
-- The game calls two functions over the Data API with the project's publishable key (role anon).
-- The table itself is closed to clients: every write goes through submit_score, which enforces the
-- rules in CLAUDE.md. Players have no accounts, so there is no auth.uid() to check: these two
-- SECURITY DEFINER functions are the deliberate, validated public API, and nothing else is exposed.

create table public.scores (
  run_id uuid primary key, -- one submission per run
  player_id uuid not null,
  name text not null check (char_length(name) between 1 and 24),
  day date, -- UTC date of a daily run; null for an ordinary run
  depth int not null check (depth >= 1),
  elapsed_ms bigint not null check (elapsed_ms >= 0),
  created_at timestamptz not null default now()
);
create index scores_daily on public.scores (day, depth desc) where day is not null;
create index scores_alltime on public.scores (depth desc) where day is null;

alter table public.scores enable row level security; -- no policies: clients cannot read or write it directly
revoke all on public.scores from public, anon, authenticated;

-- Returns 'ok', 'duplicate' (this run was already recorded: safe to forget it), or 'rejected'.
create function public.submit_score(
  p_run_id uuid, p_player_id uuid, p_name text, p_day date, p_depth int, p_elapsed_ms bigint
) returns text
language plpgsql security definer set search_path = public as $$
begin
  -- A daily run only counts on its own UTC day.
  if p_day is not null and p_day <> (now() at time zone 'utc')::date then return 'rejected'; end if;
  -- Every shift is 60 seconds, so depth N needs at least N-1 full shifts of play.
  if p_depth is null or p_elapsed_ms is null or p_depth < 1 or p_elapsed_ms < 0
     or p_depth > floor(p_elapsed_ms / 60000.0) + 1 then return 'rejected'; end if;
  if p_run_id is null or p_player_id is null or char_length(coalesce(p_name, '')) not between 1 and 24 then
    return 'rejected';
  end if;
  insert into scores (run_id, player_id, name, day, depth, elapsed_ms)
  values (p_run_id, p_player_id, p_name, p_day, p_depth, p_elapsed_ms)
  on conflict (run_id) do nothing;
  if not found then return 'duplicate'; end if;
  return 'ok';
end $$;

-- Best depth per player, deepest first. p_day null: the all-time board (ordinary runs only).
-- `me` marks the caller's own row; player ids are never returned.
create function public.top_scores(p_day date, p_player_id uuid, p_limit int default 10)
returns table (rank bigint, name text, depth int, me boolean)
language sql stable security definer set search_path = public as $$
  with best as (
    select distinct on (player_id) player_id, name, depth, created_at
    from scores
    where day is not distinct from p_day
    order by player_id, depth desc, created_at
  )
  select row_number() over (order by depth desc, created_at), name, depth, player_id is not distinct from p_player_id
  from best
  order by depth desc, created_at
  limit least(greatest(p_limit, 1), 50);
$$;

-- Supabase can grant new functions to anon/authenticated directly, so revoke from each role, then grant back.
revoke all on function public.submit_score(uuid, uuid, text, date, int, bigint) from public, anon, authenticated;
revoke all on function public.top_scores(date, uuid, int) from public, anon, authenticated;
grant execute on function public.submit_score(uuid, uuid, text, date, int, bigint) to anon;
grant execute on function public.top_scores(date, uuid, int) to anon;
