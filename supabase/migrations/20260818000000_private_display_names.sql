-- ============================================================
--  Privacy: show first name + last INITIAL only ("Mia T."), never
--  full surnames — minors' data. Names are abbreviated at the DB
--  layer so the full last name never reaches any client. Applies to
--  duel cards (nmao.competitor_card → faceoff/reveal), the duel vote
--  queue, and the leaderboards (duel/tournament/voter).
-- ============================================================

create or replace function nmao.display_name(p_first text, p_last text)
returns text language sql immutable set search_path = public as $$
  select trim(coalesce(p_first,'') || case when coalesce(p_last,'') <> '' then ' ' || upper(left(p_last,1)) || '.' else '' end)
$$;

CREATE OR REPLACE FUNCTION nmao.competitor_card(p_competitor_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (row_number() over (order by vs.votes_cast desc))::int,
         c.id, nmao.display_name(c.first_name, c.last_name), vs.votes_cast, vs.accuracy, c.id = p_competitor_id
  from voter_stats vs
  join competitors c on c.id = vs.competitor_id and c.status = 'active'
  order by vs.votes_cast desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

CREATE OR REPLACE FUNCTION public.duel_vote_queue(p_competitor_id uuid, p_limit integer DEFAULT 20, p_search text DEFAULT NULL::text)
 RETURNS TABLE(duel_id uuid, duel_type text, closes_vote_at timestamp with time zone, vote_count bigint, challenger_id uuid, challenger_name text, challenger_school text, challenger_video text, challenger_frame_code text, challenger_frame_rarity text, challenger_frame_name text, challenger_frame_desc text, opponent_id uuid, opponent_name text, opponent_school text, opponent_video text, opponent_frame_code text, opponent_frame_rarity text, opponent_frame_name text, opponent_frame_desc text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, coalesce(et.name, d.type), d.closes_vote_at,
         (select count(*) from duel_votes v where v.duel_id = d.id) as vote_count,
         ch.id, (nmao.display_name(ch.first_name, ch.last_name)), chs.name, d.challenger_video,
         ch.equipped_badge_code, chb.rarity::text, chb.name, chb.description,
         op.id, (nmao.display_name(op.first_name, op.last_name)), ops.name, d.opponent_video,
         op.equipped_badge_code, opb.rarity::text, opb.name, opb.description
  from duels d
  join competitors ch on ch.id = d.challenger_id
  join competitors op on op.id = d.opponent_id
  left join schools chs on chs.id = ch.school_id
  left join schools ops on ops.id = op.school_id
  left join badges  chb on chb.code = ch.equipped_badge_code
  left join badges  opb on opb.code = op.equipped_badge_code
  left join event_types et on et.code = d.type
  where d.status = 'voting'
    and d.moderation_status = 'ok'
    and d.challenger_id <> p_competitor_id
    and d.opponent_id <> p_competitor_id
    and not exists (select 1 from duel_votes v where v.duel_id = d.id and v.voter_competitor_id = p_competitor_id)
    and (
      p_search is null or btrim(p_search) = '' or
      (nmao.display_name(ch.first_name, ch.last_name)) ilike '%' || btrim(p_search) || '%' or
      (nmao.display_name(op.first_name, op.last_name)) ilike '%' || btrim(p_search) || '%' or
      chs.name ilike '%' || btrim(p_search) || '%' or
      ops.name ilike '%' || btrim(p_search) || '%'
    )
  order by vote_count asc, d.closes_vote_at asc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;
