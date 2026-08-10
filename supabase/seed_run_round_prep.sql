-- =====================================================================
-- RUN-THE-ROUND prep: clear the hand-seeded test scaffolding (divisions/pods/
-- assignments) on the demo round so the REAL pipeline (Close→Divide→Assign→
-- Resolve→Distribute) runs on a clean slate. Entries + their videos are kept.
-- Run once before driving the round in Mission Control. Safe to re-run.
-- =====================================================================
do $$
declare v_round uuid;
begin
  select r.id into v_round
    from rounds r join seasons s on s.id = r.season_id
   where s.name = 'Demo Season 2026' order by r.seq limit 1;
  if v_round is null then raise exception 'Demo round not found. Run seed_demo.sql first.'; end if;

  delete from judge_assignments ja using entries e where ja.entry_id = e.id and e.round_id = v_round;
  delete from pods p using divisions d where p.division_id = d.id and d.round_id = v_round;
  delete from divisions where round_id = v_round;

  raise notice 'Cleared divisions/pods/assignments for round %. Now drive Close→Divide→Assign in Mission Control.', v_round;
end $$;
