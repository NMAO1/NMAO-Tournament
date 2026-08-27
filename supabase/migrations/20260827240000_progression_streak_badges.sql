-- Progression / streak badges — computed from the per-result history (results
-- joined through entries) and per-week duel participation. All thresholds live in
-- earn_rule (MC-editable). Window-function logic validated on synthetic data
-- before shipping (islands + running-max), since current seed data has exactly
-- one result per competitor and therefore cannot exercise a streak.
--   • rising-star  — count of NEW personal-best round SCORES; tier = count vs levels[1..10]
--   • new-heights  — count of NEW personal-best RATINGS; tier = count vs levels[1..10]
--   • iron-will    — >= need consecutive round seqs competed (one-shot)
--   • undefeated   — longest run of placement=1 finishes vs levels[5,10,25,50]
--   • iron-duelist — dueled in >= need consecutive calendar weeks (one-shot)
--
-- "New personal best" counts STRICT improvements over the prior running max, so
-- the first result establishes the baseline and never itself awards a tier — the
-- conservative reading (under- rather than over-award a permanent, minor-facing
-- badge). Consecutiveness is scoped per season (seq) / by ISO week (duels).
--
-- DEFERRED: fearless ("months meeting the 5-duels/week pace; accumulative") — the
-- spec is ambiguous (does a qualifying month need every week >= 5, or an average?)
-- and mis-defining it would grant a permanent frame-upgrade badge on a guess.
-- Left unimplemented pending a product decision on the exact monthly rule.

-- Backfill one-shot thresholds where absent (MC-editable afterward).
update badges set earn_rule = jsonb_set(earn_rule, '{need}', '6'::jsonb, true)
 where code = 'iron-will' and (earn_rule->'need') is null;
update badges set earn_rule = jsonb_set(earn_rule, '{need}', '4'::jsonb, true)
 where code = 'iron-duelist' and (earn_rule->'need') is null;

create or replace function nmao.award_progression_badges()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; x int; v_need int;
begin
  -- rising-star: number of strictly-improving round scores (running max), tiered.
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select p.competitor_id, 'rising-star', lv.ord::text, false, now()
    from (
      select cid competitor_id, count(*) filter (where score > prev_max) pb
      from (
        select en.competitor_id cid, r.score,
          max(r.score) over (partition by en.competitor_id order by r.created_at
            rows between unbounded preceding and 1 preceding) prev_max
        from results r join entries en on en.id = r.entry_id
        where r.score is not null
      ) s group by cid
    ) p
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='rising-star' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where p.pb >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=p.competitor_id and b.badge_code='rising-star' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- new-heights: same shape on the rating trajectory (results.rating_after).
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select p.competitor_id, 'new-heights', lv.ord::text, false, now()
    from (
      select cid competitor_id, count(*) filter (where rating_after > prev_max) pb
      from (
        select en.competitor_id cid, r.rating_after,
          max(r.rating_after) over (partition by en.competitor_id order by r.created_at
            rows between unbounded preceding and 1 preceding) prev_max
        from results r join entries en on en.id = r.entry_id
        where r.rating_after is not null
      ) s group by cid
    ) p
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='new-heights' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where p.pb >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=p.competitor_id and b.badge_code='new-heights' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- iron-will: longest run of consecutive round seqs competed (within a season)
  -- meets earn_rule.need. Islands via seq - dense_rank().
  v_need := coalesce((select (earn_rule->>'need')::int from badges where code='iron-will' and active), 6);
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct t.cid, 'iron-will', false, now()
    from (
      select cid, count(*) over (partition by cid, season_id, grp) cnt
      from (
        select cid, season_id, seq - dense_rank() over (partition by cid, season_id order by seq) grp
        from (
          select distinct en.competitor_id cid, ro.season_id, ro.seq
          from results r join entries en on en.id = r.entry_id join rounds ro on ro.id = en.round_id
          where ro.seq is not null
        ) d
      ) g
    ) t
    where t.cnt >= v_need
      and exists (select 1 from badges b where b.code='iron-will' and b.active)
      and not exists (select 1 from badge_awards b
        where b.competitor_id=t.cid and b.badge_code='iron-will');
  get diagnostics x = row_count; total := total + x;

  -- undefeated: longest consecutive run of placement=1 finishes (chronological),
  -- tiered against earn_rule.levels [5,10,25,50].
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select u.competitor_id, 'undefeated', lv.ord::text, false, now()
    from (
      select cid competitor_id, max(runlen) maxrun
      from (
        select cid, count(*) runlen
        from (
          select cid, placement, rn - row_number() over (partition by cid, (placement=1) order by rn) g
          from (
            select en.competitor_id cid, r.placement,
              row_number() over (partition by en.competitor_id order by r.created_at) rn
            from results r join entries en on en.id = r.entry_id
            where r.placement is not null
          ) z
        ) g2
        where placement = 1
        group by cid, g
      ) runs group by cid
    ) u
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='undefeated' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where u.maxrun >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=u.competitor_id and b.badge_code='undefeated' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- iron-duelist: dueled (as either side) in >= need consecutive ISO weeks.
  -- Islands over week-start dates spaced 7 days apart.
  v_need := coalesce((select (earn_rule->>'need')::int from badges where code='iron-duelist' and active), 4);
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct t.comp, 'iron-duelist', false, now()
    from (
      select comp, count(*) over (partition by comp, grp) cnt
      from (
        select comp, (wkstart - (dense_rank() over (partition by comp order by wkstart) * interval '7 day'))::date grp
        from (
          select comp, date_trunc('week', ts)::date wkstart
          from (
            select challenger_id comp, coalesce(resolved_at, updated_at, created_at) ts
              from duels where status='complete' and challenger_id is not null
            union
            select opponent_id, coalesce(resolved_at, updated_at, created_at)
              from duels where status='complete' and opponent_id is not null
          ) x
          group by comp, date_trunc('week', ts)
        ) wk
      ) i
    ) t
    where t.comp is not null and t.cnt >= v_need
      and exists (select 1 from badges b where b.code='iron-duelist' and b.active)
      and not exists (select 1 from badge_awards b
        where b.competitor_id=t.comp and b.badge_code='iron-duelist');
  get diagnostics x = row_count; total := total + x;

  return total;
end $$;
revoke all on function nmao.award_progression_badges() from public;

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
  perform nmao.award_progression_badges();
  return v_total;
end $$;

insert into nmao.badge_engine_coverage (code, mode, note) values
  ('rising-star','data_driven','count of new personal-best scores vs earn_rule.levels'),
  ('new-heights','data_driven','count of new personal-best ratings vs earn_rule.levels'),
  ('iron-will','data_driven','>= earn_rule.need consecutive round seqs competed'),
  ('undefeated','data_driven','longest placement=1 run vs earn_rule.levels'),
  ('iron-duelist','data_driven','>= earn_rule.need consecutive weeks with a duel')
on conflict (code) do update set mode=excluded.mode, note=excluded.note;
