-- Leaderboard UX #9: always return the caller's own ranked row, even when they
-- fall outside the top p_limit — so the app can pin a "your rank" row for anyone
-- past #50. Same query/columns as before; the ranking now lives in a CTE and the
-- final filter keeps the top N plus the caller's row (deduped when already in N).
create or replace function public.duel_leaderboard(
  p_competitor_id uuid, p_scope text default 'global', p_division text default 'all',
  p_bracket text default 'all', p_limit integer default 50)
returns table(rank integer, competitor_id uuid, name text, school text, belt text,
  rating integer, wins integer, losses integer, draws integer, streak integer, best_streak integer,
  duels integer, medals integer, win_pct integer, is_you boolean, prev_rank integer)
language sql stable security definer set search_path to 'public'
as $function$
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
  ),
  lim as (select greatest(1, least(coalesce(p_limit, 50), 100)) as n)
  select r.rank, r.competitor_id, r.name, r.school, r.belt, r.rating, r.wins, r.losses, r.draws,
         r.streak, r.best_streak, r.duels, r.medals, r.win_pct, r.is_you, r.prev_rank
  from ranked r, lim
  where r.rank <= lim.n or r.is_you
  order by r.rank;
$function$;
