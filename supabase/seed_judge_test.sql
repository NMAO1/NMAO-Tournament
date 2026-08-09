-- =====================================================================
-- JUDGE APP — self-contained TEST seed  (tournament project oxzuavpyoetchwebdejp)
--
-- Lets you drive the whole Judge flow (sign in -> queue -> score -> submit)
-- WITHOUT running the engine or Mission Control. It links a "Test Judge" to
-- YOUR auth user and hand-builds a division + pod + up to 3 assignments on the
-- existing demo entries.
--
-- PREREQ (one time):
--   1. Dashboard > Authentication > Users > Add user  ->  your email + a password,
--      tick "Auto Confirm User".  (The /login screen uses email + password.)
--   2. If there are no demo entries yet, run supabase/seed_demo.sql first.
--
-- Then: set v_email below to that email and run this whole script. Safe to re-run.
-- Throwaway test scaffolding — the division/pod it makes are only for clicking the
-- UI; wipe with the cleanup block at the bottom when done.
-- =====================================================================

do $$
declare
  v_email text := 'REPLACE_WITH_YOUR_TOURNAMENT_AUTH_EMAIL';   -- <-- EDIT THIS
  v_uid   uuid;
  v_judge uuid;
  v_entry record;
  v_div   uuid;
  v_pod   uuid;
  n int := 0;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No auth user with email %. Create one first: Dashboard > Authentication > Users > Add user (tick Auto Confirm).', v_email;
  end if;

  -- A Test Judge linked to your auth account (active + cleared so the EF accepts submits).
  select id into v_judge from judges where auth_user_id = v_uid;
  if v_judge is null then
    insert into judges(first_name, last_name, email, background_check_status, status, certified_at, auth_user_id)
    values ('Test', 'Judge', v_email, 'cleared', 'active', now(), v_uid)
    returning id into v_judge;
  else
    update judges set status = 'active', background_check_status = 'cleared' where id = v_judge;
  end if;

  -- Assign up to 3 demo entries; build a division + pod per cohort as needed.
  for v_entry in
    select e.id, e.round_id, e.event, e.age_bracket, e.declared_rank
    from entries e
    where e.video_url like 'https://demo.local/%'
      and not exists (select 1 from judge_assignments ja where ja.entry_id = e.id and ja.judge_id = v_judge)
    order by e.created_at
    limit 3
  loop
    select id into v_div from divisions
      where round_id = v_entry.round_id and event = v_entry.event
        and age_key = v_entry.age_bracket and rank_key = v_entry.declared_rank;
    if v_div is null then
      insert into divisions(round_id, event, age_key, rank_key, entry_count)
      values (v_entry.round_id, v_entry.event, v_entry.age_bracket, v_entry.declared_rank, 1)
      returning id into v_div;
    end if;

    select id into v_pod from pods where division_id = v_div and seq = 1;
    if v_pod is null then
      insert into pods(division_id, seq, size, judge_count) values (v_div, 1, 1, 1) returning id into v_pod;
    end if;

    insert into judge_assignments(pod_id, entry_id, judge_id) values (v_pod, v_entry.id, v_judge)
      on conflict (entry_id, judge_id) do nothing;
    n := n + 1;
  end loop;

  if n = 0 then
    raise notice 'Test judge % linked to %, but found no demo entries to assign. Run supabase/seed_demo.sql first, then re-run this.', v_judge, v_email;
  else
    raise notice 'Test judge % linked to %; % assignment(s) ready. Sign in at /login.', v_judge, v_email, n;
  end if;
end $$;

-- What the queue will show:
select ja.state, e.event, e.age_bracket, e.declared_rank, e.video_url
from judge_assignments ja
join entries e on e.id = ja.entry_id
join judges  j on j.id = ja.judge_id
where j.first_name = 'Test' and j.last_name = 'Judge'
order by ja.state, e.event;

-- -----------------------------------------------------------------
-- CLEANUP (run to remove the test scaffolding when finished):
--   delete from judge_assignments ja using judges j
--     where ja.judge_id = j.id and j.first_name='Test' and j.last_name='Judge';
--   -- (leave the demo divisions/pods, or delete divisions where entry_count=1 and no other pods)
--   delete from judges where first_name='Test' and last_name='Judge';
-- -----------------------------------------------------------------
