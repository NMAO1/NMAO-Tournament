-- ============================================================
--  tournament_leaderboard v3 — + p_scope ('season' | 'all').
--  'season' counts only medals whose round belongs to the current
--  active season; 'all' counts every medal (lifetime). prev_rank is
--  unchanged (all-time canonical snapshot), so the client shows
--  movement only on the all-time view. Read-only, additive.
-- ============================================================

drop function if exists public.tournament_leaderboard(uuid, text, int);
create or replace function public.tournament_leaderboard(
  p_competitor_id uuid,
  p_division text default 'all',
  p_scope text default 'all',
  p_limit int default 50
)
returns table (
  rank int, competitor_id uuid, name text, school text, belt text,
  gold int, silver int, bronze int, participation int, medals int, points int, events int,
  is_you boolean, prev_rank int
)
language sql stable security definer set search_path = public as $$
  with active as (
    select id from seasons where status = 'active' order by created_at desc limit 1
  ),
  agg as (
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
    join rounds r on r.id = m.round_id
    where (p_scope = 'all' or r.season_id = (select id from active))
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
revoke all on function public.tournament_leaderboard(uuid, text, text, int) from public;
grant execute on function public.tournament_leaderboard(uuid, text, text, int) to authenticated;
