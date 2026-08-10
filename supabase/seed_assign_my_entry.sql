-- =====================================================================
-- Assign YOUR uploaded entry to your Test Judge, so you can watch your own
-- 1080p upload (signed playback) in the Judge app — the full loop.
-- PREREQ: you've run seed_judge_test.sql (Test Judge) AND submitted an entry
-- from the Compete app. Edit v_email, then run. Safe to re-run.
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
  if v_uid is null then raise exception 'No auth user with email %.', v_email; end if;

  select id into v_judge from judges where auth_user_id = v_uid;
  if v_judge is null then raise exception 'No Test Judge linked. Run seed_judge_test.sql first.'; end if;

  -- Your competitor's real uploads (storage-path videos, not the http demo clips).
  for v_entry in
    select e.id, e.round_id, e.event, e.age_bracket, e.declared_rank
    from entries e
    join competitors c on c.id = e.competitor_id
    where c.auth_user_id = v_uid
      and e.video_url is not null and e.video_url not like 'http%'
      and not exists (select 1 from judge_assignments ja where ja.entry_id = e.id and ja.judge_id = v_judge)
    order by e.updated_at desc
  loop
    select id into v_div from divisions
      where round_id = v_entry.round_id and event = v_entry.event
        and age_key = v_entry.age_bracket and rank_key = v_entry.declared_rank;
    if v_div is null then
      insert into divisions(round_id, event, age_key, rank_key, entry_count)
      values (v_entry.round_id, v_entry.event, v_entry.age_bracket, v_entry.declared_rank, 1) returning id into v_div;
    end if;
    select id into v_pod from pods where division_id = v_div and seq = 1;
    if v_pod is null then
      insert into pods(division_id, seq, size, judge_count) values (v_div, 1, 1, 1) returning id into v_pod;
    end if;
    insert into judge_assignments(pod_id, entry_id, judge_id) values (v_pod, v_entry.id, v_judge)
      on conflict (entry_id, judge_id) do nothing;
    n := n + 1;
  end loop;

  raise notice '% of your uploaded entries assigned to your Test Judge.', n;
end $$;

select ja.state, e.event, e.age_bracket, left(e.video_url, 24) as video_path
from judge_assignments ja join entries e on e.id = ja.entry_id
join judges j on j.id = ja.judge_id
where j.auth_user_id is not null and e.video_url not like 'http%';
