-- ============================================================
--  Badge award engine — connects each badge's earn_rule to actual
--  awarding (per docs/badge-earn-rules.md). Until now only dueling/
--  voting badges were granted (nmao.award_dueling_badges); this wires
--  the entry/medal/placement/exploration badges too, idempotently.
--
--  Conventions (match award_dueling_badges): non-tiered → tier NULL;
--  tiered → '1'/'2'/'3'. Idempotency via explicit not-exists (the
--  unique(competitor,badge,tier) can't dedupe NULL tiers).
--
--  Gated (dormant, active=false) until the engine matches the copy:
--  the ~2 duel/vote badges whose description promises a rule the engine
--  doesn't grant yet (see summary). Season/result/mastery/journal/
--  bracket badges are deferred (need results/season data or features).
-- ============================================================

-- Idempotent single-award helper. Returns true if a NEW award was written.
create or replace function nmao.award_badge(p_comp uuid, p_code text, p_tier text default null, p_context jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from badges b where b.code = p_code and b.active) then return false; end if;
  if exists (select 1 from badge_awards a where a.competitor_id = p_comp and a.badge_code = p_code and a.tier is not distinct from p_tier) then
    return false;
  end if;
  insert into badge_awards (competitor_id, badge_code, tier, context, seen, awarded_at)
  values (p_comp, p_code, p_tier, coalesce(p_context, '{}'::jsonb), false, now());
  return true;
end $$;

-- Evaluate the computable (entry/medal/exploration) badges for one competitor
-- from current state. Returns the number of NEW awards. Extend as data/features land.
create or replace function nmao.evaluate_badges(p_comp uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; c competitors; v_golds int; v_rounds int;
begin
  select * into c from competitors where id = p_comp and status = 'active';
  if c.id is null then return 0; end if;

  -- first-step: submitted a round entry
  if exists (select 1 from entries e where e.competitor_id = p_comp)
     and nmao.award_badge(p_comp, 'first-step') then v_n := v_n + 1; end if;

  -- first-medal: any medal of any placement
  if exists (select 1 from medals m where m.competitor_id = p_comp)
     and nmao.award_badge(p_comp, 'first-medal') then v_n := v_n + 1; end if;

  -- first-gold: a gold medal
  if exists (select 1 from medals m where m.competitor_id = p_comp and m.medal_type = 'gold')
     and nmao.award_badge(p_comp, 'first-gold') then v_n := v_n + 1; end if;

  -- podium: any top-3 finish
  if exists (select 1 from medals m where m.competitor_id = p_comp and m.medal_type in ('gold','silver','bronze'))
     and nmao.award_badge(p_comp, 'podium') then v_n := v_n + 1; end if;

  -- gold-rush: lifetime golds >= 3 (I) / 5 (II)
  select count(*) into v_golds from medals m where m.competitor_id = p_comp and m.medal_type = 'gold';
  if v_golds >= 3 and nmao.award_badge(p_comp, 'gold-rush', '1', jsonb_build_object('golds', v_golds)) then v_n := v_n + 1; end if;
  if v_golds >= 5 and nmao.award_badge(p_comp, 'gold-rush', '2', jsonb_build_object('golds', v_golds)) then v_n := v_n + 1; end if;

  -- on-the-mat: distinct rounds competed >= 3 / 6 / 9
  select count(distinct m.round_id) into v_rounds from medals m where m.competitor_id = p_comp;
  if v_rounds >= 3 and nmao.award_badge(p_comp, 'on-the-mat', '1', jsonb_build_object('rounds', v_rounds)) then v_n := v_n + 1; end if;
  if v_rounds >= 6 and nmao.award_badge(p_comp, 'on-the-mat', '2', jsonb_build_object('rounds', v_rounds)) then v_n := v_n + 1; end if;
  if v_rounds >= 9 and nmao.award_badge(p_comp, 'on-the-mat', '3', jsonb_build_object('rounds', v_rounds)) then v_n := v_n + 1; end if;

  -- both-hands: competed in a forms AND a weapons event
  if exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike '%forms%')
     and exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike '%weapons%')
     and nmao.award_badge(p_comp, 'both-hands') then v_n := v_n + 1; end if;

  -- open-mind: first entry in an Open event
  if exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike 'open%')
     and nmao.award_badge(p_comp, 'open-mind') then v_n := v_n + 1; end if;

  -- weapon-master: competed in every weapon event (Traditional + Open Weapons)
  if exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike 'traditional weapons%')
     and exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike 'open weapons%')
     and nmao.award_badge(p_comp, 'weapon-master') then v_n := v_n + 1; end if;

  -- teammate: competed in the same round as a schoolmate
  if c.school_id is not null and exists (
        select 1 from medals m1
        join medals m2 on m2.round_id = m1.round_id and m2.competitor_id <> m1.competitor_id
        join competitors o on o.id = m2.competitor_id
        where m1.competitor_id = p_comp and o.school_id = c.school_id)
     and nmao.award_badge(p_comp, 'teammate') then v_n := v_n + 1; end if;

  return v_n;
end $$;
revoke all on function nmao.evaluate_badges(uuid) from public;

-- Recompute badges for the whole roster: the entry/medal engine per competitor
-- + the existing dueling/voting engine (global). Safe to run repeatedly (cron).
create or replace function nmao.recompute_all_badges()
returns int language plpgsql security definer set search_path = public as $$
declare v_total int := 0; r record;
begin
  for r in select id from competitors where status = 'active' loop
    v_total := v_total + nmao.evaluate_badges(r.id);
  end loop;
  perform nmao.award_dueling_badges();
  return v_total;
end $$;
revoke all on function nmao.recompute_all_badges() from public;

-- Gate the badges whose description promises a rule the engine does not grant
-- yet, so the app never over-promises. Reconcile the copy/engine, then reactivate.
update badges set active = false where code in ('fair-witness', 'kingmaker') and active;

-- Recompute every 10 minutes so badges appear shortly after the earning action.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('badge-recompute')
      where exists (select 1 from cron.job where jobname = 'badge-recompute');
    perform cron.schedule('badge-recompute', '*/10 * * * *', $$select nmao.recompute_all_badges();$$);
  end if;
end
$cron$;
