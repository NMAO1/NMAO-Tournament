-- Owner mute toggle for new-join-request emails (Brad 2026-10-17).
-- When a competitor enters a school's join code and creates a PENDING
-- affiliation request, the school owner is emailed (best-effort, from the
-- join-school-by-code / onboard-competitor Edge Functions). Owners can mute
-- these from School Portal → Settings. Default ON (opt-out). Owner-editable
-- via the existing schools owner-update RLS (school_owner_update).
alter table public.schools
  add column if not exists notify_join_requests boolean not null default true;
