-- Per-duel rating snapshot → unlocks the upset badges (underdog / oracle /
-- giant-slayer). `duels` stored no rating at duel time, so an upset couldn't be
-- judged after ratings drifted. We now stamp both duelists' current duel-Elo onto
-- the row at creation (forward-only — existing duels keep NULL and are skipped,
-- since their at-the-time gap is unrecoverable). Thresholds from earn_rule →
-- these three become data_driven (MC-editable).

alter table public.duels add column if not exists challenger_rating numeric;
alter table public.duels add column if not exists opponent_rating  numeric;

-- Stamp the snapshot when a duel is created (or when the two sides are first set).
-- Guarded by `is null` so it never overwrites a captured value.
create or replace function nmao.stamp_duel_ratings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.challenger_rating is null and new.challenger_id is not null then
    select rating into new.challenger_rating from duel_ratings where competitor_id = new.challenger_id;
  end if;
  if new.opponent_rating is null and new.opponent_id is not null then
    select rating into new.opponent_rating from duel_ratings where competitor_id = new.opponent_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_duel_ratings on public.duels;
create trigger trg_stamp_duel_ratings
  before insert or update of challenger_id, opponent_id on public.duels
  for each row execute function nmao.stamp_duel_ratings();

-- Award pass for the three upset badges. All snapshot-null duels are excluded.
create or replace function nmao.award_upset_badges()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; x int;
begin
  -- underdog: duels WON while lower-rated (count ladder, earn_rule.levels)
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select u.competitor_id, 'underdog', lv.ord::text, false, now()
    from (
      select d.winner_id competitor_id, count(*) c
      from duels d
      where d.status='complete' and d.winner_id is not null
        and d.challenger_rating is not null and d.opponent_rating is not null
        and ( (d.winner_id=d.challenger_id and d.challenger_rating < d.opponent_rating)
           or (d.winner_id=d.opponent_id  and d.opponent_rating  < d.challenger_rating) )
      group by d.winner_id
    ) u
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='underdog' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where u.c >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=u.competitor_id and b.badge_code='underdog' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- oracle: votes cast for the lower-rated side that then WON (count ladder)
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select o.competitor_id, 'oracle', lv.ord::text, false, now()
    from (
      select v.voter_competitor_id competitor_id, count(*) c
      from duel_votes v join duels d on d.id = v.duel_id
      where d.status='complete' and d.winner_id is not null
        and d.challenger_rating is not null and d.opponent_rating is not null
        and v.choice = case when d.winner_id=d.challenger_id then 'challenger' else 'opponent' end
        and ( (d.winner_id=d.challenger_id and d.challenger_rating < d.opponent_rating)
           or (d.winner_id=d.opponent_id  and d.opponent_rating  < d.challenger_rating) )
      group by v.voter_competitor_id
    ) o
    cross join lateral (
      select t.ord, t.val::int thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='oracle' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where o.c >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=o.competitor_id and b.badge_code='oracle' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  -- giant-slayer: tier = largest rating gap overcome in a win (gap ladder)
  insert into badge_awards (competitor_id, badge_code, tier, seen, awarded_at)
    select g.competitor_id, 'giant-slayer', lv.ord::text, false, now()
    from (
      select d.winner_id competitor_id, max(
        case when d.winner_id=d.challenger_id then d.opponent_rating - d.challenger_rating
             else d.challenger_rating - d.opponent_rating end
      ) maxgap
      from duels d
      where d.status='complete' and d.winner_id is not null
        and d.challenger_rating is not null and d.opponent_rating is not null
      group by d.winner_id
    ) g
    cross join lateral (
      select t.ord, t.val::numeric thresh
      from jsonb_array_elements_text(
        (select earn_rule->'levels' from badges where code='giant-slayer' and active and jsonb_typeof(earn_rule->'levels')='array')
      ) with ordinality as t(val, ord)
    ) lv
    where g.maxgap >= lv.thresh
      and not exists (select 1 from badge_awards b
        where b.competitor_id=g.competitor_id and b.badge_code='giant-slayer' and b.tier=lv.ord::text);
  get diagnostics x = row_count; total := total + x;

  return total;
end $$;
revoke all on function nmao.award_upset_badges() from public;

-- Wire into the recompute cron alongside the other passes.
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
  return v_total;
end $$;

insert into nmao.badge_engine_coverage (code, mode, note) values
  ('underdog','data_driven','won-as-lower-rated ladder (per-duel snapshot), earn_rule.levels'),
  ('oracle','data_driven','correct-underdog-vote ladder (per-duel snapshot), earn_rule.levels'),
  ('giant-slayer','data_driven','largest rating gap overcome (per-duel snapshot), earn_rule.levels')
on conflict (code) do update set mode=excluded.mode, note=excluded.note;
