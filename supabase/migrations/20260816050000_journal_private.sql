-- ============================================================
-- Journal = FULLY PRIVATE (locked decision). Scope entries to the competitor's
-- OWN login (auth.uid()), NOT nmao.competitor_ids() (which also returns a
-- guardian's children). A guardian using their account therefore cannot read or
-- write a child's journal — only the competitor themselves can.
-- NOTE: this means a competitor must log in as themselves to journal; a young
-- minor accessed solely via a guardian session will not have journal access.
-- ============================================================

create or replace function nmao.self_competitor_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from competitors where auth_user_id = auth.uid()
$$;

drop policy if exists journal_read   on journal_entries;
drop policy if exists journal_insert on journal_entries;
drop policy if exists journal_update on journal_entries;
drop policy if exists journal_delete on journal_entries;

create policy journal_read   on journal_entries for select to authenticated using (competitor_id in (select nmao.self_competitor_ids()));
create policy journal_insert on journal_entries for insert to authenticated with check (competitor_id in (select nmao.self_competitor_ids()));
create policy journal_update on journal_entries for update to authenticated using (competitor_id in (select nmao.self_competitor_ids())) with check (competitor_id in (select nmao.self_competitor_ids()));
create policy journal_delete on journal_entries for delete to authenticated using (competitor_id in (select nmao.self_competitor_ids()));
