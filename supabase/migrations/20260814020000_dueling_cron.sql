-- ============================================================
-- Dueling — cron: run the resolution sweep every 5 minutes.
-- sweep_duels() is a pure-SQL SECURITY DEFINER function, so pg_cron calls it
-- directly (no Edge Function / http hop needed). It expires unanswered
-- challenges, forfeits no-shows at the upload deadline, and closes/certifies
-- voting (incl. the 60-min sudden-death overtime). cron.schedule upserts by
-- name, so re-running this migration is idempotent.
-- ============================================================

select cron.schedule('duel-sweep', '*/5 * * * *', $$ select nmao.sweep_duels(); $$);
