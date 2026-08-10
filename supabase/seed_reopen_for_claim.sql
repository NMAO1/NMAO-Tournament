-- =====================================================================
-- TEST-ONLY: reopen the demo round straight into the judging POOL so you can
-- test claim-pod. Unlocks the finalized round, clears judging outputs, and puts
-- every pod back with NO judge assignments (all seats open → they appear in the
-- "Available to judge" pool). Pods already exist, so no need to re-run divide.
-- Ratings from the prior finalize are left as-is (fine for claim testing).
-- =====================================================================
do $$
declare v_round uuid; v_scheme uuid; n int;
begin
  select r.id, r.scheme_id into v_round, v_scheme
    from rounds r join seasons s on s.id = r.season_id
   where s.name = 'Demo Season 2026' order by r.seq limit 1;
  if v_round is null then raise exception 'Demo round not found.'; end if;

  delete from judge_assignments ja using entries e where ja.entry_id = e.id and e.round_id = v_round;
  delete from medal_shipments where round_id = v_round;
  delete from medals where round_id = v_round;
  delete from results r using entries e where r.entry_id = e.id and e.round_id = v_round;

  update pods p set state = 'forming' from divisions d where p.division_id = d.id and d.round_id = v_round;
  update division_schemes set locked = false where id = v_scheme;
  update rounds set state = 'podded', locked_at = null where id = v_round;

  select count(*) into n from pods p join divisions d on d.id = p.division_id where d.round_id = v_round;
  raise notice 'Round % reopened — % pods now claimable in the pool.', v_round, n;
end $$;
