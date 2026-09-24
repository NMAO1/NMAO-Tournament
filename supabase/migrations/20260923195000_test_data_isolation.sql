-- Soft-open test-data isolation (2026-09-23):
--   Demo/test rows were polluting the LIVE leaderboards (the 26 demo-comp duelists
--   sit on duel/voter boards; synthetic test competitors on medal boards) and could
--   be matched against real students in dueling. Add an is_test flag, backfill it
--   from the demo-seed discriminators (demo-comp-%@ emails, demo-dojo-% schools,
--   status='test', orphan test artifacts), and:
--     - exclude is_test competitors from all four leaderboards, and
--     - restrict duel matchmaking to the caller's own is_test bucket (so real
--       students only meet real students, while the App Store reviewer's demo
--       account can still duel the demo pool).
--   NOTHING is deleted — protected reviewer/demo logins are preserved, just filtered.
--   "The Art of Self Defense" (real, Connect-enabled) and "Brad Lemley" stay is_test=false.

alter table public.schools     add column if not exists is_test boolean not null default false;
alter table public.competitors add column if not exists is_test boolean not null default false;
alter table public.seasons     add column if not exists is_test boolean not null default false;

-- Schools first (competitors backfill references it).
update public.schools set is_test = true
  where slug like 'demo-dojo-%' or name in ('Redeem Test Dojo', 'Test');

update public.competitors set is_test = true
  where status = 'test'
     or email like 'demo-comp-%@nmao.us'
     or email like 'test-%@nmao.us'
     or school_id in (select id from public.schools where is_test)
     or (email is null and school_id is null);

update public.seasons set is_test = true
  where name in ('Pre-Season (Test)', 'Demo Season 2025', 'Demo Season 2026');


CREATE OR REPLACE FUNCTION public.duel_leaderboard(p_competitor_id uuid, p_scope text DEFAULT 'global'::text, p_division text DEFAULT 'all'::text, p_bracket text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, competitor_id uuid, name text, school text, belt text, rating integer, wins integer, losses integer, draws integer, streak integer, best_streak integer, duels integer, medals integer, win_pct integer, is_you boolean, prev_rank integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select declared_rank, school_id, dob from competitors where id = p_competitor_id),
  ranked as (
    select (row_number() over (order by dr.rating desc, dr.wins desc))::int as rank,
           c.id as competitor_id, nmao.display_name(c.first_name, c.last_name) as name, s.name as school, c.declared_rank as belt,
           dr.rating, dr.wins, coalesce(dr.losses,0) as losses, coalesce(dr.draws,0) as draws, dr.streak, coalesce(dr.best_streak,0) as best_streak,
           coalesce(dr.duels_fought,0) as duels,
           (select count(*)::int from medals m where m.competitor_id = c.id) as medals,
           case when (coalesce(dr.wins,0) + coalesce(dr.losses,0)) > 0
                then round(100.0 * dr.wins / (dr.wins + dr.losses))::int else 0 end as win_pct,
           (c.id = p_competitor_id) as is_you,
           prev.rank as prev_rank
    from duel_ratings dr
    join competitors c on c.id = dr.competitor_id and c.status = 'active' and not coalesce(c.is_test, false)
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
      and (p_bracket = 'all' or nmao.age_bracket_of(c.dob) = p_bracket)
  ),
  lim as (select greatest(1, least(coalesce(p_limit, 50), 100)) as n)
  select r.rank, r.competitor_id, r.name, r.school, r.belt, r.rating, r.wins, r.losses, r.draws,
         r.streak, r.best_streak, r.duels, r.medals, r.win_pct, r.is_you, r.prev_rank
  from ranked r, lim
  where r.rank <= lim.n or r.is_you
  order by r.rank;
$function$

;

CREATE OR REPLACE FUNCTION public.voter_leaderboard(p_competitor_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, competitor_id uuid, name text, votes_cast integer, accuracy numeric, is_you boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ranked as (
    select (row_number() over (order by vs.votes_cast desc))::int as rank,
           c.id as competitor_id, nmao.display_name(c.first_name, c.last_name) as name,
           vs.votes_cast, vs.accuracy, (c.id = p_competitor_id) as is_you
    from voter_stats vs
    join competitors c on c.id = vs.competitor_id and c.status = 'active' and not coalesce(c.is_test, false)
  ),
  lim as (select greatest(1, least(coalesce(p_limit, 50), 100)) as n)
  select r.rank, r.competitor_id, r.name, r.votes_cast, r.accuracy, r.is_you
  from ranked r, lim
  where r.rank <= lim.n or r.is_you
  order by r.rank;
$function$

;

CREATE OR REPLACE FUNCTION public.tournament_leaderboard(p_competitor_id uuid, p_division text DEFAULT 'all'::text, p_scope text DEFAULT 'all'::text, p_bracket text DEFAULT 'all'::text, p_event text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, competitor_id uuid, name text, school text, belt text, gold integer, silver integer, bronze integer, participation integer, medals integer, points integer, events integer, is_you boolean, prev_rank integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    join competitors c on c.id = a.competitor_id and c.status = 'active' and not coalesce(c.is_test, false)
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
$function$

;

CREATE OR REPLACE FUNCTION public.school_leaderboard(p_scope text DEFAULT 'season'::text, p_bracket text DEFAULT 'all'::text, p_event text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, school_id uuid, name text, athletes integer, gold integer, silver integer, bronze integer, medals integer, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    join competitors c on c.id = m.competitor_id and c.status = 'active' and not coalesce(c.is_test, false)
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
$function$

;

CREATE OR REPLACE FUNCTION public.request_duel(p_competitor_id uuid, p_event text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cap int := nmao.duel_weekly_cap(); ch competitors; v_opp uuid; v_week int; v_rating int;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then raise exception 'not authorized to duel as this competitor' using errcode = '42501'; end if;
  if not exists (select 1 from event_types where code = p_event) then raise exception 'unknown event: %', p_event using errcode = '22023'; end if;

  select * into ch from competitors where id = p_competitor_id;
  if not coalesce(ch.dueling_enabled, false) then raise exception 'dueling is not enabled for you yet (ask your school)' using errcode = 'P0001'; end if;

  select count(*) into v_week from duels
    where challenger_id = p_competitor_id and created_at > now() - interval '7 days' and status not in ('declined','cancelled');
  if v_week >= v_cap then raise exception 'weekly duel limit reached (% per week)', v_cap using errcode = 'P0001'; end if;

  select coalesce(dr.rating, 1200) into v_rating from duel_ratings dr where dr.competitor_id = p_competitor_id;
  v_rating := coalesce(v_rating, 1200);

  select op.id into v_opp
  from competitors op
  left join duel_ratings dr on dr.competitor_id = op.id
  where op.status = 'active' and op.id <> p_competitor_id
    and coalesce(op.is_test, false) = coalesce(ch.is_test, false)
    and coalesce(op.dueling_enabled, false)
    and op.declared_rank is not distinct from ch.declared_rank
    and nmao.age_bracket_of(op.dob) is not distinct from nmao.age_bracket_of(ch.dob)
    and nmao.duel_geo_allowed(ch.school_id, op.school_id)
    and not exists (
      select 1 from duels d where d.status in ('pending','accepted','live','voting')
        and ((d.challenger_id = p_competitor_id and d.opponent_id = op.id)
          or (d.challenger_id = op.id and d.opponent_id = p_competitor_id)))
    -- NEW: never match someone either party has blocked
    and not exists (
      select 1 from blocked_competitors b
      where (b.blocker_competitor_id = p_competitor_id and b.blocked_competitor_id = op.id)
         or (b.blocker_competitor_id = op.id and b.blocked_competitor_id = p_competitor_id))
  order by (abs(coalesce(dr.rating, 1200) - v_rating) <= 150) desc, random()
  limit 1;

  if v_opp is null then
    raise exception 'No eligible opponents open right now — check back soon' using errcode = 'P0001';
  end if;

  insert into duels (challenger_id, opponent_id, type, status, response_deadline)
  values (p_competitor_id, v_opp, p_event, 'pending', now() + interval '48 hours')
  returning id into v_id;
  return v_id;
end $function$

;
