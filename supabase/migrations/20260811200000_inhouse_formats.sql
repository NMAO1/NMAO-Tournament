-- =====================================================================
-- In-house tournament FORMATS + flexible challenges.
--   format = 'in_person' (judged live) or 'video' (entrants submit a clip link)
-- Challenges are already freeform text on ih_entrants.event, so a school can
-- run Forms/Weapons OR a physical challenge (board breaking, sparring, fitness,
-- anything). This just adds the format switch + a per-entrant video link.
-- =====================================================================

alter table in_house_tournaments
  add column if not exists format text not null default 'in_person'
    check (format in ('in_person', 'video'));

alter table ih_entrants
  add column if not exists video_url text;   -- for video-format tournaments (pasted clip link, v1)
