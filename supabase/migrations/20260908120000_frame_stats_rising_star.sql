-- Add rising_star (personal-best count) to the living-frames metric bundle, driving the
-- new "Ascendant" ring (badge `rising-star`). Reuse the award engine's already-computed
-- rising-star ladder tier (public.badge_awards, recomputed every 10 min by
-- nmao.recompute_all_badges) so the ring grows on the exact number that grants the badge.
create or replace function nmao.frame_stats(p_competitor uuid)
returns jsonb
language sql stable security definer set search_path = public, nmao
as $$
  select jsonb_build_object(
    'skill_rating',   coalesce((select rating from public.skill_ratings where competitor_id = p_competitor), 0),
    'correct_votes',  coalesce((select correct  from public.voter_stats   where competitor_id = p_competitor), 0),
    'vote_accuracy',  coalesce((select round(accuracy * 100) from public.voter_stats where competitor_id = p_competitor), 0),
    'qualified_votes',coalesce((select qualified from public.voter_stats   where competitor_id = p_competitor), 0),
    'duel_wins',      coalesce((select wins     from public.duel_ratings  where competitor_id = p_competitor), 0),
    'journal',       (select count(*) from public.journal_entries where competitor_id = p_competitor),
    'events',        (select count(distinct event) from public.entries where competitor_id = p_competitor and payment_status = 'paid'),
    'medals_gold',   (select count(*) from public.medals where competitor_id = p_competitor and medal_type = 'gold'),
    'medals_silver', (select count(*) from public.medals where competitor_id = p_competitor and medal_type = 'silver'),
    'medals_bronze', (select count(*) from public.medals where competitor_id = p_competitor and medal_type = 'bronze'),
    'podiums',       (select count(*) from public.medals where competitor_id = p_competitor and medal_type in ('gold','silver','bronze')),
    'championships', (select count(*) from public.medals where competitor_id = p_competitor and placement = 1),
    'seasons',       (select count(distinct r.season_id) from public.entries e join public.rounds r on r.id = e.round_id
                        where e.competitor_id = p_competitor and r.season_id is not null),
    'rising_star',   coalesce((select max(case when tier ~ '^\d+$' then tier::int end)
                                 from public.badge_awards
                                where competitor_id = p_competitor and badge_code = 'rising-star'), 0)
  );
$$;

grant execute on function nmao.frame_stats(uuid) to authenticated, anon;
