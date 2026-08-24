-- =====================================================================
-- Judge claim TTL — pods a judge claims but doesn't finish scoring return
-- to the pool automatically after a window (default 24h), so a judge who
-- goes dark can't stall a round. Complements recuse-assignment (judge-
-- initiated release) and fill-unclaimed-pods (operator safety-net for
-- pods that were NEVER claimed).
--
-- A "claim" = the set of judge_assignments rows for one (judge_id, pod_id)
-- across every entry in the pod. If that claim is older than the TTL and
-- the judge hasn't finished scoring the whole pod (any entry still unscored),
-- the entire claim is deleted — the seat fully reopens and the pod is
-- re-judged fresh by whoever claims next (keeps the one-judge-per-pod model
-- internally consistent; partial scores from the absent judge are discarded).
-- =====================================================================

-- 1) When a claim was made. NULL on pre-existing rows => never auto-released
--    (only claims created after this ships are tracked; safe for in-flight tests).
alter table public.judge_assignments
  add column if not exists claimed_at timestamptz;

-- 2) Config: window in hours (jsonb scalar). Keep any existing value.
insert into public.app_settings (key, value)
values ('judge_claim_ttl_hours', '24'::jsonb)
on conflict (key) do nothing;

-- 3) Release function — returns the number of assignment rows freed.
create or replace function nmao.release_stale_claims()
returns integer
language plpgsql
security definer
set search_path = public, nmao
as $$
declare
  v_ttl int;
  v_released int := 0;
begin
  select coalesce((value #>> '{}')::int, 24) into v_ttl
  from public.app_settings where key = 'judge_claim_ttl_hours';
  if v_ttl is null then v_ttl := 24; end if;

  with stale as (
    select ja.judge_id, ja.pod_id
    from public.judge_assignments ja
    join public.pods p       on p.id = ja.pod_id
    join public.divisions d  on d.id = p.division_id
    join public.rounds r     on r.id = d.round_id
    where ja.claimed_at is not null
      and ja.claimed_at < now() - make_interval(hours => v_ttl)
      and p.state <> 'resolved'
      and r.state in ('podded', 'judging')
    group by ja.judge_id, ja.pod_id
    having bool_or(ja.score is null)   -- pod not fully scored by this judge yet
  )
  delete from public.judge_assignments ja
  using stale s
  where ja.judge_id = s.judge_id and ja.pod_id = s.pod_id;

  get diagnostics v_released = row_count;
  if v_released > 0 then
    raise notice 'release_stale_claims: freed % assignment row(s)', v_released;
  end if;
  return v_released;
end;
$$;

-- 4) Sweep hourly (TTL is 24h, so hourly granularity is plenty).
select cron.unschedule('release-stale-judge-claims')
where exists (select 1 from cron.job where jobname = 'release-stale-judge-claims');

select cron.schedule(
  'release-stale-judge-claims',
  '0 * * * *',
  $$select nmao.release_stale_claims();$$
);
