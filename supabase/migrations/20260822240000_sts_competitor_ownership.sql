-- =====================================================================
-- SECURITY: close a cross-tenant write on student_tournament_settings.
-- sts_owner_insert only checked that the supplied school_id is owned — it never
-- checked that competitor_id belongs to an owned school. Combined with the new
-- STS→competitors.dueling_enabled sync trigger (20260822220000), a school owner
-- could INSERT an STS row for ANY competitor and flip that competitor's
-- dueling_enabled (force-enable a child opted out by their home school, or grief
-- a rival). Tighten insert AND update WITH CHECK to require the competitor belong
-- to a school the caller owns. The legitimate portal write (a school toggling its
-- OWN athletes) still passes.
-- =====================================================================
alter policy sts_owner_insert on student_tournament_settings
  with check (
    school_id in (select nmao.owned_school_ids())
    and competitor_id in (select c.id from competitors c where c.school_id in (select nmao.owned_school_ids()))
  );

alter policy sts_owner_update on student_tournament_settings
  with check (
    school_id in (select nmao.owned_school_ids())
    and competitor_id in (select c.id from competitors c where c.school_id in (select nmao.owned_school_ids()))
  );
