-- =====================================================================
-- Idempotency hardening for the round pipeline (engine step-runner).
--
--  1. claim_step(): atomically claim a pipeline step so a concurrent
--     double-fire (cron + operator button, or a retry while the first run
--     is mid-flight) cannot execute resolve/distribute twice. Replaces the
--     racy read-status-then-set-'running' guard in engine.ts.
--
--  2. rating_history: one row per rated entry, so saveRatingUpdates can
--     UPSERT (idempotent) instead of INSERT — a re-run can no longer create
--     duplicate history rows or double-count skill_ratings.events_count.
--
-- Safe/reversible: creating a function and a unique index; no data changes.
-- NOTE: the unique index will fail if rating_history already contains rows
-- with duplicate entry_id (only possible from a prior double-run in testing);
-- dedupe those first if so. Fresh/pre-production DBs are unaffected.
-- =====================================================================

-- (2) One rating_history row per rated entry — the UPSERT conflict target.
create unique index if not exists rating_history_entry_uk
  on rating_history (entry_id);

-- (1) Atomically claim a pipeline step.
-- Returns true ONLY to the caller that wins the claim (row absent, or its
-- status is 'pending'/'error'); returns false if another worker already
-- holds it ('running') or it is already 'done'. The single INSERT ... ON
-- CONFLICT ... WHERE statement takes the row lock, so it is race-free.
create or replace function public.claim_step(p_round_id uuid, p_step text)
returns boolean
language plpgsql
as $$
declare
  claimed boolean;
begin
  insert into round_step_runs (round_id, step, status, started_at)
  values (p_round_id, p_step, 'running', now())
  on conflict (round_id, step) do update
      set status = 'running', started_at = now()
    where round_step_runs.status not in ('running', 'done')
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

grant execute on function public.claim_step(uuid, text) to service_role;
