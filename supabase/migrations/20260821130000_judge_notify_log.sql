-- ============================================================
-- judge_notify_log — dedup guard for the "new pods available" judge broadcast.
-- round-controller fires notify-judges(kind:new_pods) once per round when
-- pods are assigned; this table makes that idempotent (a retry / re-run of
-- assign_judges won't re-blast every judge). Per-round granularity matches
-- notify-judges, which broadcasts to all active judges (not per-pod).
-- Service-role only (no RLS policies → only the edge function touches it).
-- ============================================================
create table if not exists public.judge_notify_log (
  round_id  uuid        not null references public.rounds(id) on delete cascade,
  kind      text        not null,
  sent_at   timestamptz not null default now(),
  primary key (round_id, kind)
);
alter table public.judge_notify_log enable row level security;
-- intentionally no policies: only service_role (which bypasses RLS) reads/writes.
