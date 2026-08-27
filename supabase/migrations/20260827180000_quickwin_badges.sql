-- Quick-win badge batch: wire 3 badges whose award logic is computable from
-- existing data, all thresholds read from earn_rule so they stay MC-editable
-- (mode = data_driven). Mirrors the set-based style of award_dueling_badges.
--   • dueling-master  — tiered ladder on duel_ratings.duels_fought (earn_rule.levels)
--   • ascent          — tiered ladder on skill_ratings.rating   (earn_rule.levels)
--   • style-explorer  — one-shot: >= N Traditional AND >= N Open entries (earn_rule.need)
--
-- NOT included (need data we don't store): underdog / oracle / giant-slayer all
-- require each duel's rating gap AT DUEL TIME, and `duels` keeps no rating
-- snapshot — computing from today's drifting rating would mis-award. Those wait
-- on a per-duel rating snapshot.

create or replace function nmao.award_quickwin_badges()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; x int; v_trad int; v_open int;
begin
  -- dueling-master: total duels fought vs earn_rule.levels (tier = level ordinal)
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select dr.competitor_id, 'dueling-master', lv.ord::text, false, now()
    from duel_ratings dr
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges
          where code='dueling-master' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where dr.duels_fought >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=dr.competitor_id and b.badge_code='dueling-master' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- ascent: absolute skill rating vs earn_rule.levels. Non-provisional only — a
  -- milestone badge is permanent, so we don't grant it off a still-settling rating.
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select sr.competitor_id, 'ascent', lv.ord::text, false, now()
    from skill_ratings sr
    cross join lateral (
      select t.ord, t.val::numeric thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges
          where code='ascent' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where coalesce(sr.provisional, false) = false
      and sr.rating >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=sr.competitor_id and b.badge_code='ascent' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- style-explorer: >= need.traditional Traditional entries AND >= need.open Open
  -- entries (lifetime). entries.event is coded (trad_*, open_*); also tolerate the
  -- human-string form. Thresholds from earn_rule.need.
  select coalesce((earn_rule->'need'->>'traditional')::int, 5),
         coalesce((earn_rule->'need'->>'open')::int, 5)
    into v_trad, v_open
    from badges where code='style-explorer' and active;
  if found then
    insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
      select e.competitor_id, 'style-explorer', false, now()
      from entries e
      group by e.competitor_id
      having count(*) filter (where e.event ilike 'trad%' or e.event ilike 'traditional%') >= v_trad
         and count(*) filter (where e.event ilike 'open%') >= v_open
         and not exists (select 1 from badge_awards b
              where b.competitor_id=e.competitor_id and b.badge_code='style-explorer');
    get diagnostics x = row_count; total := total + x;
  end if;

  return total;
end $$;
revoke all on function nmao.award_quickwin_badges() from public;

-- Wire the new pass into the recompute cron (alongside evaluate_badges + dueling).
create or replace function nmao.recompute_all_badges()
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_total int := 0; r record;
begin
  for r in select id from competitors where status = 'active' loop
    v_total := v_total + nmao.evaluate_badges(r.id);
  end loop;
  perform nmao.award_dueling_badges();
  perform nmao.award_quickwin_badges();
  return v_total;
end $$;

-- Coverage: these three now award from their earn_rule → data_driven (green in MC).
insert into nmao.badge_engine_coverage (code, mode, note) values
  ('dueling-master','data_driven','duels_fought ladder, reads earn_rule.levels'),
  ('ascent','data_driven','skill-rating ladder (non-provisional), reads earn_rule.levels'),
  ('style-explorer','data_driven','Traditional+Open entry counts, reads earn_rule.need')
on conflict (code) do update set mode=excluded.mode, note=excluded.note;
