-- ============================================================================
-- Remove competitors.membership_status — redundant with the established
-- school_affiliation_requests model (migration 20260907130000):
--   pending   = competitors.school_id IS NULL + a pending affiliation request
--   confirmed = competitors.school_id set (only the owner-approval RPC sets it)
-- Keeping a single source of truth avoids roster-pollution and double state.
-- schools.join_code (added in 20260921170000) is retained — it feeds the same
-- affiliation-request flow via the join-school-by-code function.
-- ============================================================================

drop index if exists public.idx_competitors_school_membership;
alter table public.competitors drop constraint if exists competitors_membership_status_chk;
alter table public.competitors drop column if exists membership_status;
