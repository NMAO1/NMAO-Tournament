-- ============================================================
--  CLUSTER-1 HARDENING (pre-submission audit fixes)
--  1. Re-assert the display-name privacy layer — live drifted: duel_leaderboard
--     & tournament_leaderboard were still returning FULL minor surnames while
--     voter_leaderboard (same original migration 20260818000000) was correct.
--     Re-running all definitions guarantees live == repo (minors' last names
--     never leave the DB in full).
--  2. my_active_duels — was an unauthenticated IDOR (filtered only on the
--     client-supplied competitor id); add an ownership gate + revoke anon.
--  3. Revoke anon/public from the config-read admin RPCs (leaked tournament
--     config to anon; only the staff-authenticated MC config.html calls them).
--  4. Floor the in-house platform fee so a school owner can't zero NMAO's cut.
-- ============================================================

-- ---------- 1. display-name privacy (re-assert 20260818000000) ----------
create or replace function nmao.display_name(p_first text, p_last text)
returns text language sql immutable set search_path = public as $$
  select trim(coalesce(p_first,'') || case when coalesce(p_last,'') <> '' then ' ' || upper(left(p_last,1)) || '.' else '' end)
$$;

CREATE OR REPLACE FUNCTION nmao.competitor_card(p_competitor_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'competitor_id', c.id,
    'name', nmao.display_name(c.first_name, c.last_name),
    'first_name', c.first_name,
    'last_name', upper(left(c.last_name,1)),
    'school', s.name,
    'rank', c.declared_rank,
    'age_bracket', nmao.age_bracket_of(c.dob),
    'photo', c.profile_photo_url,
    'rating', coalesce(dr.rating, 1200),
    'duel_wins', coalesce(dr.wins, 0),
    'win_streak', coalesce(dr.streak, 0),
    'best_streak', coalesce(dr.best_streak, 0),
    'frame', case when c.equipped_badge_code is null then null else
      jsonb_build_object('code', b.code, 'name', b.name, 'rarity', b.rarity::text, 'description', b.description) end
  )
  from competitors c
  left join schools s        on s.id = c.school_id
  left join duel_ratings dr  on dr.competitor_id = c.id
  left join badges b         on b.code = c.equipped_badge_code
  where c.id = p_competitor_id
$function$;

CREATE OR REPLACE FUNCTION public.duel_leaderboard(p_competitor_id uuid, p_scope text DEFAULT 'global'::text, p_division text DEFAULT 'all'::text, p_bracket text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, competitor_id uuid, name text, school text, belt text, rating integer, wins integer, losses integer, draws integer, streak integer, best_streak integer, duels integer, medals integer, win_pct integer, is_you boolean, prev_rank integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select declared_rank, school_id, dob from competitors where id = p_competitor_id)
  select (row_number() over (order by dr.rating desc, dr.wins desc))::int,
         c.id, nmao.display_name(c.first_name, c.last_name), s.name, c.declared_rank,
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
    and (p_bracket = 'all' or nmao.age_bracket_of(c.dob) = p_bracket)
  order by dr.rating desc, dr.wins desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

CREATE OR REPLACE FUNCTION public.tournament_leaderboard(p_competitor_id uuid, p_division text DEFAULT 'all'::text, p_scope text DEFAULT 'all'::text, p_bracket text DEFAULT 'all'::text, p_event text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, competitor_id uuid, name text, school text, belt text, gold integer, silver integer, bronze integer, participation integer, medals integer, points integer, events integer, is_you boolean, prev_rank integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  )
  select (row_number() over (order by a.points desc, a.gold desc, a.medals desc))::int,
         c.id, nmao.display_name(c.first_name, c.last_name), s.name, c.declared_rank,
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
$function$;

CREATE OR REPLACE FUNCTION public.voter_leaderboard(p_competitor_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(rank integer, competitor_id uuid, name text, votes_cast integer, accuracy numeric, is_you boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select (row_number() over (order by vs.votes_cast desc))::int,
         c.id, nmao.display_name(c.first_name, c.last_name), vs.votes_cast, vs.accuracy, c.id = p_competitor_id
  from voter_stats vs
  join competitors c on c.id = vs.competitor_id and c.status = 'active'
  order by vs.votes_cast desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

-- ---------- 2. my_active_duels — close the unauthenticated IDOR ----------
-- Add an ownership gate (returns nothing unless the caller owns p_competitor_id)
-- and revoke anon so the function is unreachable without a user JWT.
create or replace function public.my_active_duels(p_competitor_id uuid)
returns table (duel_id uuid, event text, status text, role text, my_video_in boolean, opp_name text, deadline timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id,
         coalesce(et.name, d.type),
         d.status,
         case when d.challenger_id = p_competitor_id then 'challenger' else 'opponent' end,
         case when d.challenger_id = p_competitor_id then d.challenger_video is not null else d.opponent_video is not null end,
         'Mystery opponent'::text,
         case d.status when 'pending' then d.response_deadline when 'accepted' then d.upload_deadline else d.closes_vote_at end
  from duels d
  left join event_types et on et.code = d.type
  where p_competitor_id in (select nmao.competitor_ids())          -- ownership gate (was missing → IDOR)
    and (d.challenger_id = p_competitor_id or d.opponent_id = p_competitor_id)
    and d.status in ('pending','accepted','live','voting')
  order by d.created_at desc
  limit 25
$$;
revoke all on function public.my_active_duels(uuid) from public, anon;
grant execute on function public.my_active_duels(uuid) to authenticated;

-- ---------- 3. config-read admin RPCs — no longer anon-readable ----------
revoke all on function public.admin_event_types()  from public, anon;
revoke all on function public.admin_age_brackets() from public, anon;
revoke all on function public.admin_pod_settings() from public, anon;

-- ---------- 4. in-house platform fee floor ----------
-- Owners have FOR ALL write on their tournament row; without a floor they could
-- set platform_fee_bps = 0 and keep NMAO's 5% cut. Pin to [500, 10000].
update public.in_house_tournaments set platform_fee_bps = 500 where platform_fee_bps < 500;
alter table public.in_house_tournaments drop constraint if exists in_house_platform_fee_floor;
alter table public.in_house_tournaments
  add constraint in_house_platform_fee_floor check (platform_fee_bps between 500 and 10000);
