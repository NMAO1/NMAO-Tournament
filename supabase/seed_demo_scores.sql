-- =====================================================================
-- NMAO Tournament — DEMO judge scores
--
-- Run this AFTER `divide` + `assign_judges` have created judge_assignments
-- (i.e. after POSTing {step:"divide"} then {step:"assign_judges"} to
-- round-controller). It stands in for judges submitting from the app so the
-- `resolve` + `distribute` steps have scores to work with.
--
-- Each judge's score tracks the competitor's entry rating with a small,
-- DETERMINISTIC jitter (hashtext) so placements are sensible and reproducible.
-- Only fills rows that haven't been scored yet, so it's safe to re-run.
-- =====================================================================

update judge_assignments ja
set score = round(
      least(99, greatest(1,
        e.rating_at_entry + ((abs(hashtext(ja.judge_id::text || e.id::text)) % 7) - 3)
      ))::numeric, 2),
    state = 'submitted',
    submitted_at = now()
from entries e
where ja.entry_id = e.id
  and ja.score is null;

select count(*) as scored_assignments
from judge_assignments
where score is not null;
