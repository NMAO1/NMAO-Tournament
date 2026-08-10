-- =====================================================================
-- Let a school owner read + write their students' tournament controls
-- (student_tournament_settings: allowed_events, dueling, class, geo, merch).
-- Additive owner-scoped policies alongside the existing read-only ones.
-- =====================================================================
alter table student_tournament_settings enable row level security;

drop policy if exists sts_owner_read on student_tournament_settings;
create policy sts_owner_read on student_tournament_settings for select to authenticated
  using (school_id in (select nmao.owned_school_ids()));

drop policy if exists sts_owner_insert on student_tournament_settings;
create policy sts_owner_insert on student_tournament_settings for insert to authenticated
  with check (school_id in (select nmao.owned_school_ids()));

drop policy if exists sts_owner_update on student_tournament_settings;
create policy sts_owner_update on student_tournament_settings for update to authenticated
  using (school_id in (select nmao.owned_school_ids()))
  with check (school_id in (select nmao.owned_school_ids()));
