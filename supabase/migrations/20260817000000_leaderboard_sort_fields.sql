-- ============================================================
--  duel_leaderboard v2 — add sort fields + a division filter.
--  New columns: belt (declared_rank), losses, draws, best_streak,
--  duels (duels_fought), medals (count), win_pct. New param p_division
--  ('all' | 'beginner' | 'intermediate' | 'advanced'; advanced also
--  includes black_belt). The client re-sorts/re-ranks the returned set.
--  Read-only (stable, security definer) — additive, replaces the reader.
-- ============================================================

drop function if exists public.duel_leaderboard(uuid, text, int);

create or replace function public.duel_leaderboard(
  p_competitor_id uuid,
  p_scope text default 'global',
  p_division text default 'all',
  p_limit int default 50
)
returns table (
  rank int, competitor_id uuid, name text, school text, belt text,
  rating int, wins int, losses int, draws int, streak int, best_streak int,
  duels int, medals int, win_pct int, is_you boolean
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
         c.id = p_competitor_id
  from duel_ratings dr
  join competitors c on c.id = dr.competitor_id and c.status = 'active'
  left join schools s on s.id = c.school_id
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
