-- Entry-timing badges — computed from entries.created_at vs rounds.opens_at /
-- closes_at. Thresholds live in earn_rule (MC-editable); several rules were
-- missing a numeric param, so we backfill them here before reading them.
--   • early-bird      — entry within the first N hours after the window opens (one-shot)
--   • buzzer-beater   — entry within the final N seconds before the deadline (one-shot)
--   • deadline-warrior— entries in the last N hours before deadline >= levels[] (ladder)
--   • back-on-the-mat — entered a round after skipping one within your active range (one-shot)
--
-- A round only counts if it has the relevant timestamp (opens_at / closes_at);
-- rounds without it are simply excluded — no approximation. All windows are
-- half-open on the entry side (created_at <= deadline) so a late entry never
-- counts as a buzzer-beater. Forward-looking: most seeded rounds have no
-- opens/closes yet, so these award ~0 on current test data (correct).

-- Backfill missing thresholds (only when absent, so MC edits are preserved).
update badges set earn_rule = jsonb_set(earn_rule, '{within_hours}', '48'::jsonb, true)
 where code = 'early-bird' and (earn_rule->'within_hours') is null;
update badges set earn_rule = jsonb_set(earn_rule, '{within_hours}', '6'::jsonb, true)
 where code = 'deadline-warrior' and (earn_rule->'within_hours') is null;
update badges set earn_rule = jsonb_set(earn_rule, '{levels}', '[3,5,10]'::jsonb, true)
 where code = 'deadline-warrior' and jsonb_typeof(earn_rule->'levels') is distinct from 'array';
-- buzzer-beater already carries within_seconds:60.

create or replace function nmao.award_entry_timing_badges()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; x int; v_hours numeric; v_secs numeric;
begin
  -- early-bird: any entry inside [opens_at, opens_at + within_hours].
  v_hours := coalesce((select (earn_rule->>'within_hours')::numeric from badges where code='early-bird' and active), 48);
  if v_hours is not null then
    insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
      select distinct e.competitor_id, 'early-bird', false, now()
      from entries e join rounds r on r.id = e.round_id
      where r.opens_at is not null
        and e.created_at >= r.opens_at
        and e.created_at <= r.opens_at + make_interval(hours => v_hours::int)
        and not exists (select 1 from badge_awards b
          where b.competitor_id=e.competitor_id and b.badge_code='early-bird');
    get diagnostics x = row_count; total := total + x;
  end if;

  -- buzzer-beater: any entry inside [closes_at - within_seconds, closes_at].
  v_secs := coalesce((select (earn_rule->>'within_seconds')::numeric from badges where code='buzzer-beater' and active), 60);
  if v_secs is not null then
    insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
      select distinct e.competitor_id, 'buzzer-beater', false, now()
      from entries e join rounds r on r.id = e.round_id
      where r.closes_at is not null
        and e.created_at <= r.closes_at
        and e.created_at >= r.closes_at - make_interval(secs => v_secs)
        and not exists (select 1 from badge_awards b
          where b.competitor_id=e.competitor_id and b.badge_code='buzzer-beater');
    get diagnostics x = row_count; total := total + x;
  end if;

  -- deadline-warrior: count entries in the last within_hours before each deadline,
  -- summed across rounds; tiered against earn_rule.levels.
  v_hours := coalesce((select (earn_rule->>'within_hours')::numeric from badges where code='deadline-warrior' and active), 6);
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select dw.competitor_id, 'deadline-warrior', lv.ord::text, false, now()
    from (
      select e.competitor_id, count(*) c
      from entries e join rounds r on r.id = e.round_id
      where r.closes_at is not null
        and e.created_at <= r.closes_at
        and e.created_at >= r.closes_at - make_interval(hours => v_hours::int)
      group by e.competitor_id
    ) dw
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='deadline-warrior' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where dw.c >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=dw.competitor_id and b.badge_code='deadline-warrior' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- back-on-the-mat: within a single season, there is a round whose seq falls
  -- strictly between the competitor's first and last entered round yet which
  -- they did NOT enter — i.e. they returned after skipping a round they had
  -- already been competing around. Requires prior participation, so a late
  -- FIRST entry never qualifies.
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select ent.competitor_id, 'back-on-the-mat', false, now()
    from (
      select en.competitor_id, ro.season_id, min(ro.seq) mn, max(ro.seq) mx
      from entries en join rounds ro on ro.id = en.round_id
      where ro.seq is not null
      group by en.competitor_id, ro.season_id
    ) ent
    where exists (select 1 from badges b where b.code='back-on-the-mat' and b.active)
      and exists (
        select 1 from rounds rm
        where rm.season_id = ent.season_id and rm.seq > ent.mn and rm.seq < ent.mx
          and not exists (select 1 from entries en2 join rounds r2 on r2.id = en2.round_id
                          where en2.competitor_id = ent.competitor_id and r2.id = rm.id))
      and not exists (select 1 from badge_awards b
        where b.competitor_id=ent.competitor_id and b.badge_code='back-on-the-mat');
  get diagnostics x = row_count; total := total + x;

  return total;
end $$;
revoke all on function nmao.award_entry_timing_badges() from public;

create or replace function nmao.recompute_all_badges()
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_total int := 0; r record;
begin
  for r in select id from competitors where status = 'active' loop
    v_total := v_total + nmao.evaluate_badges(r.id);
  end loop;
  perform nmao.award_dueling_badges();
  perform nmao.award_quickwin_badges();
  perform nmao.award_upset_badges();
  perform nmao.award_duel_special_badges();
  perform nmao.award_entry_timing_badges();
  return v_total;
end $$;

insert into nmao.badge_engine_coverage (code, mode, note) values
  ('early-bird','data_driven','entry within earn_rule.within_hours of opens_at'),
  ('buzzer-beater','data_driven','entry within earn_rule.within_seconds of closes_at'),
  ('deadline-warrior','data_driven','entries in last within_hours before deadline vs earn_rule.levels'),
  ('back-on-the-mat','data_driven','returned after skipping a round within active season range')
on conflict (code) do update set mode=excluded.mode, note=excluded.note;
