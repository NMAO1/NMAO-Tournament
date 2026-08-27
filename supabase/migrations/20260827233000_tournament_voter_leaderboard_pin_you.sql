-- Leaderboard UX #9 (cont.): pin the caller's own row on the Tournament and
-- Voters boards too, so "your rank" is visible past the top 50 under whatever
-- filters are selected (rank division · age bracket · event · season for
-- tournament). Same shape as duel_leaderboard: rank in a CTE, keep top-N + is_you.

create or replace function public.tournament_leaderboard(
  p_competitor_id uuid, p_division text default 'all', p_scope text default 'all',
  p_bracket text default 'all', p_event text default 'all', p_limit integer default 50)
returns table(rank integer, competitor_id uuid, name text, school text, belt text,
  gold integer, silver integer, bronze integer, participation integer, medals integer,
  points integer, events integer, is_you boolean, prev_rank integer)
language sql stable security definer set search_path to 'public'
as $function$
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
  ),
  ranked as (
    select (row_number() over (order by a.points desc, a.gold desc, a.medals desc))::int as rank,
           c.id as competitor_id, nmao.display_name(c.first_name, c.last_name) as name, s.name as school, c.declared_rank as belt,
           a.gold, a.silver, a.bronze, a.participation, a.medals, a.points, a.events,
           (c.id = p_competitor_id) as is_you,
           prev.rank as prev_rank
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
  ),
  lim as (select greatest(1, least(coalesce(p_limit, 50), 100)) as n)
  select r.rank, r.competitor_id, r.name, r.school, r.belt, r.gold, r.silver, r.bronze,
         r.participation, r.medals, r.points, r.events, r.is_you, r.prev_rank
  from ranked r, lim
  where r.rank <= lim.n or r.is_you
  order by r.rank;
$function$;

create or replace function public.voter_leaderboard(p_competitor_id uuid, p_limit integer default 50)
returns table(rank integer, competitor_id uuid, name text, votes_cast integer, accuracy numeric, is_you boolean)
language sql stable security definer set search_path to 'public'
as $function$
  with ranked as (
    select (row_number() over (order by vs.votes_cast desc))::int as rank,
           c.id as competitor_id, nmao.display_name(c.first_name, c.last_name) as name,
           vs.votes_cast, vs.accuracy, (c.id = p_competitor_id) as is_you
    from voter_stats vs
    join competitors c on c.id = vs.competitor_id and c.status = 'active'
  ),
  lim as (select greatest(1, least(coalesce(p_limit, 50), 100)) as n)
  select r.rank, r.competitor_id, r.name, r.votes_cast, r.accuracy, r.is_you
  from ranked r, lim
  where r.rank <= lim.n or r.is_you
  order by r.rank;
$function$;
