-- ============================================================
--  rank_history — weekly canonical-rank snapshots so the app can
--  show movement arrows (▲/▼) on the leaderboards. Canonical =
--  the GLOBAL, all-division ranking for each board:
--    duelist    -> rating desc, wins desc
--    tournament -> points desc, gold desc, medals desc
--  duel_leaderboard / tournament_leaderboard gain a prev_rank column
--  (the competitor's most recent snapshot before today); the client
--  renders the delta only on the global all-division canonical view.
-- ============================================================

create table if not exists public.rank_history (
  board         text not null,                       -- 'duelist' | 'tournament'
  competitor_id uuid not null references competitors(id) on delete cascade,
  rank          int  not null,
  captured_on   date not null,
  primary key (board, competitor_id, captured_on)
);
create index if not exists rank_history_board_day on public.rank_history (board, captured_on);

-- Capture today's canonical (global, all-division) ranks for both boards.
-- Idempotent for a given day via the on-conflict upsert. Schedule weekly.
create or replace function public.snapshot_leaderboard_ranks(p_on date default current_date)
returns void language sql security definer set search_path = public as $$
  insert into rank_history (board, competitor_id, rank, captured_on)
  select 'duelist', d.competitor_id, d.rank, p_on
  from (
    select dr.competitor_id,
           (row_number() over (order by dr.rating desc, dr.wins desc))::int as rank
    from duel_ratings dr
    join competitors c on c.id = dr.competitor_id and c.status = 'active'
    where coalesce(c.dueling_enabled, false)
  ) d
  on conflict (board, competitor_id, captured_on) do update set rank = excluded.rank;

  insert into rank_history (board, competitor_id, rank, captured_on)
  select 'tournament', t.competitor_id, t.rank, p_on
  from (
    select m.competitor_id,
           (row_number() over (order by
              (5 * count(*) filter (where m.medal_type = 'gold')
               + 3 * count(*) filter (where m.medal_type = 'silver')
               + 1 * count(*) filter (where m.medal_type = 'bronze')) desc,
              count(*) filter (where m.medal_type = 'gold') desc,
              count(*) desc))::int as rank
    from medals m
    join competitors c on c.id = m.competitor_id and c.status = 'active'
    group by m.competitor_id
  ) t
  on conflict (board, competitor_id, captured_on) do update set rank = excluded.rank;
$$;

revoke all on function public.snapshot_leaderboard_ranks(date) from public;

-- Weekly snapshot: Mondays 07:00 UTC. Re-runnable (unschedule if it exists).
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('leaderboard-weekly-snapshot')
      where exists (select 1 from cron.job where jobname = 'leaderboard-weekly-snapshot');
    perform cron.schedule('leaderboard-weekly-snapshot', '0 7 * * 1',
      $$select public.snapshot_leaderboard_ranks();$$);
  end if;
end
$cron$;

-- ---- duel_leaderboard v3: + prev_rank ----------------------------------
drop function if exists public.duel_leaderboard(uuid, text, text, int);
create or replace function public.duel_leaderboard(
  p_competitor_id uuid,
  p_scope text default 'global',
  p_division text default 'all',
  p_limit int default 50
)
returns table (
  rank int, competitor_id uuid, name text, school text, belt text,
  rating int, wins int, losses int, draws int, streak int, best_streak int,
  duels int, medals int, win_pct int, is_you boolean, prev_rank int
)
language sql stable security definer set search_path = public as $$
  with me as (select declared_rank, school_id, dob from competitors where id = p_competitor_id)
  select (row_number() over (order by dr.rating desc, dr.wins desc))::int,
         c.id, c.first_name || ' ' || c.last_name, s.name, c.declared_rank,
         dr.rating, dr.wins, coalesce(dr.losses,0), coalesce(dr.draws,0), dr.streak, coalesce(dr.best_streak,0),
         coalesce(dr.duels_fought,0),
         (select count(*)::int from medals m where m.competitor_id = c.id),
         case when (coalesce(dr.wins,0) + coalesce(dr.losses,0)) > 0
              then round(100.0 * dr.wins / (dr.wins + dr.losses))::int else 0 end,
         c.id = p_competitor_id,
         prev.rank
  from duel_ratings dr
  join competitors c on c.id = dr.competitor_id and c.status = 'active'
  left join schools s on s.id = c.school_id
  left join lateral (
    select rh.rank from rank_history rh
    where rh.board = 'duelist' and rh.competitor_id = c.id and rh.captured_on < current_date
    order by rh.captured_on desc limit 1
  ) prev on true
  cross join me
  where coalesce(c.dueling_enabled, false)
    and (p_scope <> 'school'  or c.school_id is not distinct from me.school_id)
    and (p_scope <> 'bracket' or (c.declared_rank is not distinct from me.declared_rank
         and nmao.age_bracket_of(c.dob) is not distinct from nmao.age_bracket_of(me.dob)))
    and (p_division = 'all'
         or (p_division = 'advanced' and c.declared_rank in ('advanced','black_belt'))
         or c.declared_rank = p_division)
  order by dr.rating desc, dr.wins desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.duel_leaderboard(uuid, text, text, int) from public;
grant execute on function public.duel_leaderboard(uuid, text, text, int) to authenticated;

-- ---- tournament_leaderboard v2: + prev_rank ----------------------------
drop function if exists public.tournament_leaderboard(uuid, text, int);
create or replace function public.tournament_leaderboard(
  p_competitor_id uuid,
  p_division text default 'all',
  p_limit int default 50
)
returns table (
  rank int, competitor_id uuid, name text, school text, belt text,
  gold int, silver int, bronze int, participation int, medals int, points int, events int,
  is_you boolean, prev_rank int
)
language sql stable security definer set search_path = public as $$
  with agg as (
    select m.competitor_id,
      count(*) filter (where m.medal_type = 'gold')::int          as gold,
      count(*) filter (where m.medal_type = 'silver')::int        as silver,
      count(*) filter (where m.medal_type = 'bronze')::int        as bronze,
      count(*) filter (where m.medal_type = 'participation')::int as participation,
      count(*)::int                                               as medals,
      count(distinct m.event)::int                                as events,
      (5 * count(*) filter (where m.medal_type = 'gold')
       + 3 * count(*) filter (where m.medal_type = 'silver')
       + 1 * count(*) filter (where m.medal_type = 'bronze'))::int as points
    from medals m
    group by m.competitor_id
  )
  select (row_number() over (order by a.points desc, a.gold desc, a.medals desc))::int,
         c.id, c.first_name || ' ' || c.last_name, s.name, c.declared_rank,
         a.gold, a.silver, a.bronze, a.participation, a.medals, a.points, a.events,
         c.id = p_competitor_id,
         prev.rank
  from agg a
  join competitors c on c.id = a.competitor_id and c.status = 'active'
  left join schools s on s.id = c.school_id
  left join lateral (
    select rh.rank from rank_history rh
    where rh.board = 'tournament' and rh.competitor_id = c.id and rh.captured_on < current_date
    order by rh.captured_on desc limit 1
  ) prev on true
  where (p_division = 'all'
         or (p_division = 'advanced' and c.declared_rank in ('advanced','black_belt'))
         or c.declared_rank = p_division)
  order by a.points desc, a.gold desc, a.medals desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.tournament_leaderboard(uuid, text, int) from public;
grant execute on function public.tournament_leaderboard(uuid, text, int) to authenticated;
