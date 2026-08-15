-- ============================================================
--  Event filter for the tournament + school boards.
--  * event_options() — distinct medal events (data-driven dropdown).
--  * tournament_leaderboard / school_leaderboard gain p_event ('all' or
--    an exact medals.event, e.g. 'Traditional Forms'). Read-only, additive.
-- ============================================================

create or replace function public.event_options()
returns table (event text)
language sql stable security definer set search_path = public as $$
  select distinct event from medals order by event
$$;
revoke all on function public.event_options() from public;
grant execute on function public.event_options() to authenticated;

-- ---- tournament_leaderboard v5: + p_event --------------------------------
drop function if exists public.tournament_leaderboard(uuid, text, text, text, int);
create or replace function public.tournament_leaderboard(
  p_competitor_id uuid,
  p_division text default 'all',
  p_scope text default 'all',
  p_bracket text default 'all',
  p_event text default 'all',
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
      and (p_event = 'all' or m.event = p_event)
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
    and (p_bracket = 'all' or nmao.age_bracket_of(c.dob) = p_bracket)
  order by a.points desc, a.gold desc, a.medals desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.tournament_leaderboard(uuid, text, text, text, text, int) from public;
grant execute on function public.tournament_leaderboard(uuid, text, text, text, text, int) to authenticated;

-- ---- school_leaderboard: + p_event ---------------------------------------
drop function if exists public.school_leaderboard(text, text, int);
create or replace function public.school_leaderboard(
  p_scope text default 'season',
  p_bracket text default 'all',
  p_event text default 'all',
  p_limit int default 50
)
returns table (
  rank int, school_id uuid, name text, athletes int,
  gold int, silver int, bronze int, medals int, points int
)
language sql stable security definer set search_path = public as $$
  with active as (
    select id from seasons where status = 'active' order by created_at desc limit 1
  ),
  agg as (
    select c.school_id,
      count(distinct m.competitor_id)::int                        as athletes,
      count(*) filter (where m.medal_type = 'gold')::int          as gold,
      count(*) filter (where m.medal_type = 'silver')::int        as silver,
      count(*) filter (where m.medal_type = 'bronze')::int        as bronze,
      count(*)::int                                               as medals,
      (5 * count(*) filter (where m.medal_type = 'gold')
       + 3 * count(*) filter (where m.medal_type = 'silver')
       + 1 * count(*) filter (where m.medal_type = 'bronze'))::int as points
    from medals m
    join competitors c on c.id = m.competitor_id and c.status = 'active'
    join rounds r on r.id = m.round_id
    where c.school_id is not null
      and (p_scope = 'all' or r.season_id = (select id from active))
      and (p_bracket = 'all' or nmao.age_bracket_of(c.dob) = p_bracket)
      and (p_event = 'all' or m.event = p_event)
    group by c.school_id
  )
  select (row_number() over (order by a.points desc, a.gold desc, a.medals desc))::int,
         s.id, s.name, a.athletes, a.gold, a.silver, a.bronze, a.medals, a.points
  from agg a
  join schools s on s.id = a.school_id
  order by a.points desc, a.gold desc, a.medals desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.school_leaderboard(text, text, text, int) from public;
grant execute on function public.school_leaderboard(text, text, text, int) to authenticated;
