-- Duel special-case badges — computable from duels + duel_votes, no schema change.
-- All four are one-shot (tier NULL), mirroring award_dueling_badges conventions
-- (explicit not-exists idempotency; winner side = 'challenger'/'opponent').
--   • clutch           — won a duel resolved in sudden death (overtime_until set)
--   • flawless-victory — won with 100% of the community vote (>= min_votes cast)
--   • photo-finish     — won by exactly a 1-vote margin
--   • redemption       — beat an opponent who had previously beaten you
--
-- Sudden death ⟺ `duels.overtime_until is not null` (see dueling-resolution:
-- a tie at close opens 60 min of overtime → win or deadlock). deadlock already
-- awards the DRAW counterpart; clutch is the WIN counterpart.
-- flawless min_votes reads from earn_rule (duels certify at >= 3 votes, so a
-- unanimous result is a real community verdict, not a 1-0 fluke).

-- Ensure flawless-victory carries a min_votes floor (MC-editable). Default 3.
update badges
   set earn_rule = jsonb_set(earn_rule, '{min_votes}', '3'::jsonb, true)
 where code = 'flawless-victory' and (earn_rule->'min_votes') is null;

create or replace function nmao.award_duel_special_badges()
returns int language plpgsql security definer set search_path = public as $$
declare total int := 0; x int; v_min_votes int;
begin
  -- clutch: a WIN in a duel that went to sudden death (overtime opened).
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct d.winner_id, 'clutch', false, now()
    from duels d
    where d.status = 'complete' and d.winner_id is not null
      and d.result in ('challenger','opponent')
      and d.overtime_until is not null
      and exists (select 1 from badges b where b.code='clutch' and b.active)
      and not exists (select 1 from badge_awards b
        where b.competitor_id=d.winner_id and b.badge_code='clutch');
  get diagnostics x = row_count; total := total + x;

  -- flawless-victory: winner took 100% of a non-trivial community vote.
  v_min_votes := coalesce((select (earn_rule->>'min_votes')::int from badges
                            where code='flawless-victory' and active), 3);
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct d.winner_id, 'flawless-victory', false, now()
    from duels d
    where d.status = 'complete' and d.winner_id is not null
      and d.result in ('challenger','opponent')
      and exists (select 1 from badges b where b.code='flawless-victory' and b.active)
      -- all cast votes went to the winning side, and enough were cast
      and (select count(*) from duel_votes v where v.duel_id=d.id) >= v_min_votes
      and (select count(*) from duel_votes v where v.duel_id=d.id
            and v.choice <> (case when d.winner_id=d.challenger_id then 'challenger' else 'opponent' end)) = 0
      and not exists (select 1 from badge_awards b
        where b.competitor_id=d.winner_id and b.badge_code='flawless-victory');
  get diagnostics x = row_count; total := total + x;

  -- photo-finish: won by exactly one vote.
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct d.winner_id, 'photo-finish', false, now()
    from duels d
    where d.status = 'complete' and d.winner_id is not null
      and d.result in ('challenger','opponent')
      and exists (select 1 from badges b where b.code='photo-finish' and b.active)
      and ( (select count(*) from duel_votes v where v.duel_id=d.id
              and v.choice = (case when d.winner_id=d.challenger_id then 'challenger' else 'opponent' end))
          - (select count(*) from duel_votes v where v.duel_id=d.id
              and v.choice = (case when d.winner_id=d.challenger_id then 'opponent' else 'challenger' end)) ) = 1
      and not exists (select 1 from badge_awards b
        where b.competitor_id=d.winner_id and b.badge_code='photo-finish');
  get diagnostics x = row_count; total := total + x;

  -- redemption: beat an opponent who beat you in an EARLIER completed duel.
  insert into badge_awards (competitor_id, badge_code, seen, awarded_at)
    select distinct w.winner_id, 'redemption', false, now()
    from duels w
    where w.status = 'complete' and w.winner_id is not null
      and w.result in ('challenger','opponent')
      and exists (select 1 from badges b where b.code='redemption' and b.active)
      and exists (
        select 1 from duels l
        where l.status='complete' and l.winner_id is not null and l.result in ('challenger','opponent')
          and coalesce(l.resolved_at, l.updated_at) < coalesce(w.resolved_at, w.updated_at)
          -- earlier winner was w's loser (the opponent O) ...
          and l.winner_id = (case when w.winner_id=w.challenger_id then w.opponent_id else w.challenger_id end)
          -- ... and O's earlier victim was the current winner (C)
          and (case when l.winner_id=l.challenger_id then l.opponent_id else l.challenger_id end) = w.winner_id)
      and not exists (select 1 from badge_awards b
        where b.competitor_id=w.winner_id and b.badge_code='redemption');
  get diagnostics x = row_count; total := total + x;

  return total;
end $$;
revoke all on function nmao.award_duel_special_badges() from public;

-- Wire into the recompute cron (after the existing passes).
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
  return v_total;
end $$;

insert into nmao.badge_engine_coverage (code, mode, note) values
  ('clutch','data_driven','won a sudden-death duel (overtime_until set)'),
  ('flawless-victory','data_driven','100% of community vote, >= earn_rule.min_votes'),
  ('photo-finish','data_driven','won by exactly a 1-vote margin'),
  ('redemption','data_driven','beat an opponent who beat you earlier (resolved_at order)')
on conflict (code) do update set mode=excluded.mode, note=excluded.note;
