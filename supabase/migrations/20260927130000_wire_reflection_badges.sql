-- Wire the Journal / Reflection set into the award engine (2026-09-27).
-- These badges already have art + rows; they were display-only because the
-- last coverage audit ran before journal_entries existed. It exists now, so:
--   first-reflection     = wrote a first journal entry
--   consistent-journaler = journaled 3 / 10 / 25 times (tiered ladder)
--   reflective-warrior   = journaled after EVERY round competed in a season
--                          (>=3 rounds, 100% reflection rate) — distinct from
--                          consistent-journaler, which is raw volume.

-- Keep the tier thresholds visible in earn_rule for the Badges editor.
update public.badges
  set earn_rule = earn_rule || jsonb_build_object('levels', jsonb_build_array(3,10,25))
  where code = 'consistent-journaler';

CREATE OR REPLACE FUNCTION nmao.evaluate_badges(p_comp uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_n int := 0; c competitors; v_golds int; v_rounds int;
  v_streak int; v_third_loss timestamptz; v_journals int;
begin
  select * into c from competitors where id = p_comp and status = 'active';
  if c.id is null then return 0; end if;

  if exists (select 1 from entries e where e.competitor_id = p_comp)
     and nmao.award_badge(p_comp, 'first-step') then v_n := v_n + 1; end if;

  if exists (select 1 from medals m where m.competitor_id = p_comp)
     and nmao.award_badge(p_comp, 'first-medal') then v_n := v_n + 1; end if;

  if exists (select 1 from medals m where m.competitor_id = p_comp and m.medal_type in ('gold','silver','bronze'))
     and nmao.award_badge(p_comp, 'podium') then v_n := v_n + 1; end if;

  select count(*) into v_golds from medals m where m.competitor_id = p_comp and m.medal_type = 'gold';
  if v_golds >= 3 and nmao.award_badge(p_comp, 'gold-rush', '1', jsonb_build_object('golds', v_golds)) then v_n := v_n + 1; end if;
  if v_golds >= 5 and nmao.award_badge(p_comp, 'gold-rush', '2', jsonb_build_object('golds', v_golds)) then v_n := v_n + 1; end if;

  select count(distinct m.round_id) into v_rounds from medals m where m.competitor_id = p_comp;
  if v_rounds >= 3 and nmao.award_badge(p_comp, 'on-the-mat', '1', jsonb_build_object('rounds', v_rounds)) then v_n := v_n + 1; end if;
  if v_rounds >= 6 and nmao.award_badge(p_comp, 'on-the-mat', '2', jsonb_build_object('rounds', v_rounds)) then v_n := v_n + 1; end if;
  if v_rounds >= 9 and nmao.award_badge(p_comp, 'on-the-mat', '3', jsonb_build_object('rounds', v_rounds)) then v_n := v_n + 1; end if;

  if exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike '%forms%')
     and exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike '%weapons%')
     and nmao.award_badge(p_comp, 'both-hands') then v_n := v_n + 1; end if;

  if exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike 'open%')
     and nmao.award_badge(p_comp, 'open-mind') then v_n := v_n + 1; end if;

  if exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike 'traditional weapons%')
     and exists (select 1 from medals m where m.competitor_id = p_comp and m.event ilike 'open weapons%')
     and nmao.award_badge(p_comp, 'weapon-master') then v_n := v_n + 1; end if;

  if c.school_id is not null and exists (
        select 1 from medals m1
        join medals m2 on m2.round_id = m1.round_id and m2.competitor_id <> m1.competitor_id
        join competitors o on o.id = m2.competitor_id
        where m1.competitor_id = p_comp and o.school_id = c.school_id)
     and nmao.award_badge(p_comp, 'teammate') then v_n := v_n + 1; end if;

  -- ── character-over-scoreboard badges (2026-09-27) ──────────────────────

  -- continue-the-path: entered 3+ real rounds in a row (consecutive seq, no gaps).
  select coalesce(max(cnt), 0) into v_streak from (
    select count(*) cnt
    from (
      select r.seq, r.seq - row_number() over (order by r.seq) grp
      from (
        select distinct r.seq
        from entries e join rounds r on r.id = e.round_id
        where e.competitor_id = p_comp and r.seq < 900
      ) r
    ) g
    group by g.grp
  ) z;
  if v_streak >= 3 and nmao.award_badge(p_comp, 'continue-the-path', null,
       jsonb_build_object('streak', v_streak)) then v_n := v_n + 1; end if;

  -- unbroken: took 3+ duel losses, then came back to the mat afterward.
  select resolved_at into v_third_loss from (
    select d.resolved_at, row_number() over (order by d.resolved_at) rn
    from duels d
    where (d.challenger_id = p_comp or d.opponent_id = p_comp)
      and d.resolved_at is not null
      and d.winner_id is not null
      and d.winner_id <> p_comp
  ) x where rn = 3;
  if v_third_loss is not null
     and exists (
       select 1 from duels d
       where (d.challenger_id = p_comp or d.opponent_id = p_comp)
         and d.resolved_at > v_third_loss)
     and nmao.award_badge(p_comp, 'unbroken') then v_n := v_n + 1; end if;

  -- complete-martialist: entered all four events.
  if (select count(distinct e.event) from entries e
        where e.competitor_id = p_comp
          and e.event in ('trad_forms','open_forms','trad_weapons','open_weapons')) >= 4
     and nmao.award_badge(p_comp, 'complete-martialist') then v_n := v_n + 1; end if;

  -- ── journal / reflection badges (2026-09-27) ───────────────────────────
  select count(*) into v_journals from journal_entries j where j.competitor_id = p_comp;

  -- first-reflection: wrote a first journal entry.
  if v_journals >= 1 and nmao.award_badge(p_comp, 'first-reflection') then v_n := v_n + 1; end if;

  -- consistent-journaler: 3 / 10 / 25 journal entries (tiered).
  if v_journals >= 3  and nmao.award_badge(p_comp, 'consistent-journaler', '1', jsonb_build_object('entries', v_journals)) then v_n := v_n + 1; end if;
  if v_journals >= 10 and nmao.award_badge(p_comp, 'consistent-journaler', '2', jsonb_build_object('entries', v_journals)) then v_n := v_n + 1; end if;
  if v_journals >= 25 and nmao.award_badge(p_comp, 'consistent-journaler', '3', jsonb_build_object('entries', v_journals)) then v_n := v_n + 1; end if;

  -- reflective-warrior: journaled after EVERY real round competed in a season
  -- (>=3 rounds, 100% reflection rate).
  if exists (
       select 1 from (
         select r.season_id,
           count(distinct e.round_id) entered,
           count(distinct e.round_id) filter (where jr.round_id is not null) journaled
         from entries e
         join rounds r on r.id = e.round_id and r.seq < 900
         left join journal_entries jr
           on jr.competitor_id = p_comp and jr.round_id = e.round_id
         where e.competitor_id = p_comp
         group by r.season_id
       ) s
       where s.entered >= 3 and s.journaled = s.entered)
     and nmao.award_badge(p_comp, 'reflective-warrior') then v_n := v_n + 1; end if;

  -- medal-path ladders (first-bronze/silver/gold), data-driven from earn_rule
  v_n := v_n + nmao.evaluate_medal_ladders(p_comp);

  return v_n;
end $function$;
