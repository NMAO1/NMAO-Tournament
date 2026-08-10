-- =====================================================================
-- Let a school owner read their athletes' entries (for the Entries tab —
-- register + payment status). Additive; complements entry_read.
-- =====================================================================
drop policy if exists entry_owner_read on entries;
create policy entry_owner_read on entries for select to authenticated
  using (competitor_id in (
    select c.id from competitors c where c.school_id in (select nmao.owned_school_ids())
  ));
