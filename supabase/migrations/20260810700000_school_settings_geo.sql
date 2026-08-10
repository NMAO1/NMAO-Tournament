-- =====================================================================
-- School Settings: coordinates (for geo distance-matching) + logo, and let the
-- owner update their own school profile.
-- =====================================================================
alter table schools add column if not exists lat numeric(9,6);
alter table schools add column if not exists lng numeric(9,6);
alter table schools add column if not exists logo_url text;

drop policy if exists school_owner_update on schools;
create policy school_owner_update on schools for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
