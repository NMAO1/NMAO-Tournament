-- A: data-drive the medal-path ladders (first-bronze/silver/gold) so their
--    thresholds come from badges.earn_rule.levels (edit in the Badges admin →
--    takes effect live). first-bronze/silver were previously UNWIRED; first-gold
--    moves from a binary award to the tiered ladder.
-- B: a coverage registry + admin RPC so the Badges panel can tell the truth about
--    which badges the engine actually awards (data-driven / engine / not-yet).

-- ── A ────────────────────────────────────────────────────────────────────────
-- Generic medal-count ladder: for each active badge whose rule is a pure
-- medal-count ladder (trigger on_medal_awarded, a metal, levels, no special unit),
-- count that metal's medals and award tier ordinals from earn_rule.levels.
create or replace function nmao.evaluate_medal_ladders(p_comp uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; b record; v_count int; i int; lvl int;
begin
  for b in
    select code, earn_rule from badges
    where active
      and earn_rule->>'trigger' = 'on_medal_awarded'
      and earn_rule->>'unit' is null            -- excludes weapon_gold etc. (event-specific)
      and earn_rule ? 'metal'
      and jsonb_typeof(earn_rule->'levels') = 'array'
  loop
    select count(*) into v_count from medals m
      where m.competitor_id = p_comp and m.medal_type = (b.earn_rule->>'metal');
    i := 0;
    for lvl in select x::int from jsonb_array_elements_text(b.earn_rule->'levels') x loop
      i := i + 1;
      if v_count >= lvl and nmao.award_badge(p_comp, b.code, i::text, jsonb_build_object('count', v_count)) then
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
end $$;

-- Re-declare evaluate_badges: identical to the engine, minus the binary first-gold
-- block (now covered by the medal ladder), plus the medal-ladder pass at the end.
create or replace function nmao.evaluate_badges(p_comp uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; c competitors; v_golds int; v_rounds int;
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

  -- medal-path ladders (first-bronze/silver/gold), data-driven from earn_rule
  v_n := v_n + nmao.evaluate_medal_ladders(p_comp);

  return v_n;
end $$;
revoke all on function nmao.evaluate_badges(uuid) from public;
revoke all on function nmao.evaluate_medal_ladders(uuid) from public;

-- ── B ────────────────────────────────────────────────────────────────────────
-- Coverage registry: declares, per badge, whether/how the engine awards it, so
-- the Badges admin can flag rules the engine won't honor (prevents editing "into
-- the void"). Keep this in sync as the engine grows.
create table if not exists nmao.badge_engine_coverage (
  code text primary key references badges(code) on delete cascade,
  mode text not null check (mode in ('data_driven','engine','config','unimplemented')),
  note text
);

insert into nmao.badge_engine_coverage (code, mode, note) values
  ('first-bronze','data_driven','medal-count ladder, reads earn_rule.levels'),
  ('first-silver','data_driven','medal-count ladder, reads earn_rule.levels'),
  ('first-gold','data_driven','medal-count ladder, reads earn_rule.levels'),
  ('first-step','engine','entry engine (existence)'),
  ('first-medal','engine','entry engine (existence)'),
  ('podium','engine','entry engine (existence)'),
  ('gold-rush','engine','entry engine (thresholds hardcoded 3/5)'),
  ('on-the-mat','engine','entry engine (thresholds hardcoded 3/6/9)'),
  ('both-hands','engine','entry engine (existence)'),
  ('open-mind','engine','entry engine (existence)'),
  ('weapon-master','engine','entry engine — awards on competing in weapon events, differs from earn_rule.unit'),
  ('teammate','engine','entry engine (existence)'),
  ('daily-voter','config','dueling engine + dueling_award_config'),
  ('deadlock','engine','dueling engine'),
  ('duelist','engine','dueling engine (thresholds hardcoded)'),
  ('first-blood','engine','dueling engine'),
  ('first-duel','engine','dueling engine'),
  ('first-vote','engine','dueling engine'),
  ('peoples-champion','config','dueling engine + dueling_award_config'),
  ('rivalry','config','dueling engine + dueling_award_config'),
  ('road-warrior','config','dueling engine + dueling_award_config'),
  ('sharp-eye','config','dueling engine + dueling_award_config'),
  ('undefeated-duelist','config','dueling engine + dueling_award_config'),
  ('voice-of-the-people','config','dueling engine + dueling_award_config'),
  ('warpath','config','dueling engine + dueling_award_config')
on conflict (code) do update set mode = excluded.mode, note = excluded.note;

-- Staff-read RPC for the panel: { code: mode } for every ACTIVE badge; anything
-- not in the registry is reported 'unimplemented' (engine doesn't award it yet).
create or replace function public.admin_badge_coverage()
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
begin
  perform public._require_staff();
  return coalesce((
    select jsonb_object_agg(b.code, jsonb_build_object('mode', coalesce(c.mode,'unimplemented'), 'note', c.note))
    from badges b
    left join nmao.badge_engine_coverage c on c.code = b.code
    where coalesce(b.active, true)
  ), '{}'::jsonb);
end $$;
grant execute on function public.admin_badge_coverage() to authenticated;
