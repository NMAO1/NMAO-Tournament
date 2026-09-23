-- ============================================================
-- Upload reminders (2026-09-21)
-- Adds the deadline + dedup tracking that the two reminder edge functions read:
--   • entry-upload-reminders   (monthly season entries)
--   • inhouse-upload-reminders (in-house, format='video')
-- The hourly crons that invoke those functions are scheduled out-of-band (they
-- carry the x-cron-secret, kept out of the repo — same as the other tournament crons).
-- No-video-at-deadline auto-credit lives in closeRound (_shared/supabaseStore.ts).
-- ============================================================

-- In-house: optional explicit upload cutoff (falls back to event_date @ 23:59 ET when null).
alter table in_house_tournaments add column if not exists upload_deadline timestamptz;

-- In-house: per-entrant record of which reminder windows have fired (works for guest
-- entrants with no competitor_id, where the in-app notifications table can't dedup).
alter table ih_entrants add column if not exists upload_reminders_sent text[] not null default '{}';
