-- =====================================================================
-- In-house tournament PRIZE — a tournament-level prize description set at
-- creation (locked with the rest of the config), shown to competitors in the
-- member app. Replaces the old per-entrant prize column as the prize source.
-- =====================================================================

alter table in_house_tournaments add column if not exists prize text;
