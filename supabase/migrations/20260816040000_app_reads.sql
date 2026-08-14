-- ============================================================
-- App reads for the finished screens (Achievements / Leaderboard).
-- SECURITY DEFINER so they can read across competitors (RLS hides others):
--   duel_leaderboard  — standings scoped global / school / rank+age-bracket
--   voter_leaderboard — the community-voting board
--   badge_vault       — earned + locked badges (rarest/earned first) + medals + equipped
-- ============================================================

create or replace function public.duel_leaderboard(p_competitor_id uuid, p_scope text default 'global', p_limit int default 50)
returns table (rank int, competitor_id uuid, name text, school text, rating int, wins int, streak int, is_you boolean)
language sql stable security definer set search_path = public as $$
  with me as (select declared_rank, school_id, dob from competitors where id = p_competitor_id)
  select (row_number() over (order by dr.rating desc, dr.wins desc))::int,
         c.id, c.first_name || ' ' || c.last_name, s.name, dr.rating, dr.wins, dr.streak, c.id = p_competitor_id
  from duel_ratings dr
  join competitors c on c.id = dr.competitor_id and c.status = 'active'
  left join schools s on s.id = c.school_id
  cross join me
  where coalesce(c.dueling_enabled, false)
    and (p_scope <> 'school'  or c.school_id is not distinct from me.school_id)
    and (p_scope <> 'bracket' or (c.declared_rank is not distinct from me.declared_rank
         and nmao.age_bracket_of(c.dob) is not distinct from nmao.age_bracket_of(me.dob)))
  order by dr.rating desc, dr.wins desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.voter_leaderboard(p_competitor_id uuid, p_limit int default 50)
returns table (rank int, competitor_id uuid, name text, votes_cast int, accuracy numeric, is_you boolean)
language sql stable security definer set search_path = public as $$
  select (row_number() over (order by vs.votes_cast desc))::int,
         c.id, c.first_name || ' ' || c.last_name, vs.votes_cast, vs.accuracy, c.id = p_competitor_id
  from voter_stats vs
  join competitors c on c.id = vs.competitor_id and c.status = 'active'
  order by vs.votes_cast desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.badge_vault(p_competitor_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipped', (select equipped_badge_code from competitors where id = p_competitor_id),
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', b.code, 'name', b.name, 'description', b.description, 'rarity', b.rarity,
        'emblem_key', b.emblem_key, 'tiered', b.tiered,
        'earned', ba.badge_code is not null, 'tier', ba.tier, 'seen', coalesce(ba.seen, true))
        order by (ba.badge_code is not null) desc, b.sort_order)
      from badges b
      left join badge_awards ba on ba.badge_code = b.code and ba.competitor_id = p_competitor_id
      where coalesce(b.active, true) and (not coalesce(b.hidden, false) or ba.badge_code is not null)
    ), '[]'::jsonb),
    'medals', coalesce((
      select jsonb_agg(jsonb_build_object('tier', m.medal_type, 'place', m.placement, 'event', m.event, 'created_at', m.created_at) order by m.created_at desc)
      from medals m where m.competitor_id = p_competitor_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.duel_leaderboard(uuid, text, int) from public;
revoke all on function public.voter_leaderboard(uuid, int)      from public;
revoke all on function public.badge_vault(uuid)                 from public;
grant execute on function public.duel_leaderboard(uuid, text, int) to authenticated;
grant execute on function public.voter_leaderboard(uuid, int)      to authenticated;
grant execute on function public.badge_vault(uuid)                 to authenticated;
