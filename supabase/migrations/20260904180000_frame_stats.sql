-- =====================================================================
-- LIVING FRAMES — per-competitor metric bundle that drives the Arena border art.
-- One cheap read → the value each badge's living frame grows on. security definer
-- so a voter viewing a duel can read the two fighters' public progress numbers.
-- =====================================================================
create or replace function nmao.frame_stats(p_competitor uuid)
returns jsonb
language sql stable security definer set search_path = public, nmao
as $$
  select jsonb_build_object(
    'skill_rating',  coalesce((select rating from public.skill_ratings where competitor_id = p_competitor), 0),
    'correct_votes', coalesce((select correct  from public.voter_stats   where competitor_id = p_competitor), 0),
    'duel_wins',     coalesce((select wins     from public.duel_ratings  where competitor_id = p_competitor), 0),
    'journal',       (select count(*) from public.journal_entries where competitor_id = p_competitor),
    'events',        (select count(distinct event) from public.entries where competitor_id = p_competitor and payment_status = 'paid'),
    'medals_gold',   (select count(*) from public.medals where competitor_id = p_competitor and medal_type = 'gold'),
    'medals_silver', (select count(*) from public.medals where competitor_id = p_competitor and medal_type = 'silver'),
    'medals_bronze', (select count(*) from public.medals where competitor_id = p_competitor and medal_type = 'bronze'),
    'podiums',       (select count(*) from public.medals where competitor_id = p_competitor and medal_type in ('gold','silver','bronze')),
    'championships', (select count(*) from public.medals where competitor_id = p_competitor and placement = 1),
    'seasons',       (select count(distinct r.season_id) from public.entries e join public.rounds r on r.id = e.round_id
                        where e.competitor_id = p_competitor and r.season_id is not null)
  );
$$;

grant execute on function nmao.frame_stats(uuid) to authenticated, anon;
