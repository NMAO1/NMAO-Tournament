-- ============================================================================
-- Per-school toggle: auto-accept competitors who enter the school's join code.
--   false (default) = a join-code entry creates a PENDING affiliation request the
--                     owner must approve (safe: strangers can't self-add).
--   true            = the join code confirms the competitor onto the roster
--                     immediately (less friction; the owner opts in).
-- The owner flips this in the school portal Settings.
-- ============================================================================

alter table public.schools
  add column if not exists auto_approve_join boolean not null default false;

comment on column public.schools.auto_approve_join is
  'When true, entering this school''s join code confirms the competitor onto the roster immediately instead of creating a pending request.';
