-- Audit log for school-owner event changes on a round entry (Brad 2026-10-18).
-- A school can change which event an existing entry is for (competitor signed up
-- for the wrong event). The change itself is applied by the service-role
-- change-entry-event Edge Function (owner-auth, round must be open/collecting);
-- this table records who changed what, from→to, and whether a video was cleared.
-- Owners can read their own school's change history; all writes are service-role.
create table if not exists public.entry_event_changes (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries(id) on delete cascade,
  round_id      uuid not null,
  competitor_id uuid not null,
  school_id     uuid not null,
  from_event    text not null,
  to_event      text not null,
  cleared_video boolean not null default false,
  changed_by    uuid,            -- auth.uid() of the acting school owner
  created_at    timestamptz not null default now()
);
create index if not exists idx_entry_event_changes_entry  on public.entry_event_changes(entry_id);
create index if not exists idx_entry_event_changes_school on public.entry_event_changes(school_id, created_at desc);

alter table public.entry_event_changes enable row level security;
-- Owners read their own school's history; no INSERT/UPDATE/DELETE policy → writes
-- are service-role only (the Edge Function), consistent with entries locking.
drop policy if exists eec_owner_read on public.entry_event_changes;
create policy eec_owner_read on public.entry_event_changes
  for select using (school_id in (select nmao.owned_school_ids()));
