-- =====================================================================
-- School Portal foundation: link a school owner to their school, and give
-- owners scoped access to their roster + results. All policies are ADDITIVE
-- (permissive) so they OR with the existing competitor/staff policies.
--
-- This is ALSO how "only owners set rank" is enforced: competitors have no
-- self-update policy, so declared_rank is writable only by a school owner
-- (competitor_owner_update) or the service role.
-- =====================================================================

alter table schools add column if not exists auth_user_id uuid;
create index if not exists idx_schools_auth on schools(auth_user_id);

-- schools this signed-in user owns
create or replace function nmao.owned_school_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select id from schools where auth_user_id = auth.uid();
$$;

-- owner reads their own school
drop policy if exists school_owner_read on schools;
create policy school_owner_read on schools for select to authenticated
  using (auth_user_id = auth.uid());

-- owner reads / adds / edits their athletes (incl. declared_rank)
drop policy if exists competitor_owner_read on competitors;
create policy competitor_owner_read on competitors for select to authenticated
  using (school_id in (select nmao.owned_school_ids()));

drop policy if exists competitor_owner_insert on competitors;
create policy competitor_owner_insert on competitors for insert to authenticated
  with check (school_id in (select nmao.owned_school_ids()));

drop policy if exists competitor_owner_update on competitors;
create policy competitor_owner_update on competitors for update to authenticated
  using (school_id in (select nmao.owned_school_ids()))
  with check (school_id in (select nmao.owned_school_ids()));

-- owner reads their athletes' results / medals / ratings
drop policy if exists results_owner_read on results;
create policy results_owner_read on results for select to authenticated
  using (exists (
    select 1 from entries e join competitors c on c.id = e.competitor_id
    where e.id = results.entry_id and c.school_id in (select nmao.owned_school_ids())));

drop policy if exists medals_owner_read on medals;
create policy medals_owner_read on medals for select to authenticated
  using (competitor_id in (select c.id from competitors c where c.school_id in (select nmao.owned_school_ids())));

drop policy if exists skillrating_owner_read on skill_ratings;
create policy skillrating_owner_read on skill_ratings for select to authenticated
  using (competitor_id in (select c.id from competitors c where c.school_id in (select nmao.owned_school_ids())));
