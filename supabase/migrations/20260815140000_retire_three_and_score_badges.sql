-- ============================================================
-- Final review items — retirements + score thresholds. CATALOG ONLY.
--   Retire (active=false): dojo-pride (#79), encourager (#81), ghost (#84).
--   #82 perfect-score → every judging criterion above 96 ("across the board").
--   #83 zen → overall performance score above 95 (stays hidden). Distinct from
--        perfect-score (per-criterion) so it isn't a strict subset.
-- Idempotent UPDATEs keyed by code.
-- ============================================================

-- retirements
update badges set active = false where code = 'dojo-pride';
update badges set active = false where code = 'encourager';
update badges set active = false where code = 'ghost';

-- #82 perfect-score → all criteria > 96
update badges set
  description = 'Score above 96 in every judging criterion.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Every criterion score above 96 (across the board)","unit":"criterion_min","threshold":96,"across_the_board":true}'::jsonb
where code = 'perfect-score';

-- #83 zen → overall > 95 (hidden)
update badges set
  description = 'Score above 95 overall in a single performance.',
  earn_rule   = '{"trigger":"on_result_finalized","rule":"Overall performance score above 95","unit":"overall_score","threshold":95}'::jsonb
where code = 'zen';
