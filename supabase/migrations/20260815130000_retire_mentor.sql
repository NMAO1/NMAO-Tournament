-- ============================================================
-- #97 mentor → RETIRED (active=false). encourager (#81) already covers sending
-- approved encouragement to dojo-mates; mentor was a redundant overlap.
-- Idempotent UPDATE keyed by code.
-- ============================================================

update badges set active = false where code = 'mentor';
