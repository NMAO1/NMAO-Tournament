-- =====================================================================
-- TEST-ONLY: make the "Fill unclaimed" safety-net visibly assign judges.
-- In the demo, every demo judge is conflicted (own-school) with every pod, so
-- only the school-less Test Judge is eligible. This nulls 4 demo judges' schools
-- so they're eligible for every pod, and reopens the pods empty. Then click
-- "Fill unclaimed" in Mission Control and watch it assign several.
-- =====================================================================
update judges set school_id = null
  where email in ('demo-judge-1@nmao.us','demo-judge-2@nmao.us','demo-judge-3@nmao.us','demo-judge-4@nmao.us');

do $$
declare v_round uuid;
begin
  select r.id into v_round from rounds r join seasons s on s.id = r.season_id
   where s.name = 'Demo Season 2026' order by r.seq limit 1;
  delete from judge_assignments ja using entries e where ja.entry_id = e.id and e.round_id = v_round;
  update pods p set state = 'forming' from divisions d where p.division_id = d.id and d.round_id = v_round;
  raise notice 'Reopened pods + 4 neutral judges now eligible. Click "Fill unclaimed" in Mission Control.';
end $$;
