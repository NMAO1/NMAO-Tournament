-- =====================================================================
-- Second camera angle for entries.
-- Competitors may submit up to TWO angles (e.g. front + side); judges view
-- them side by side while scoring. Additive + nullable — safe on live.
-- The competitor upload flow (M3) populates video_url (angle 1) + video_url_2.
-- =====================================================================
alter table entries add column if not exists video_url_2 text;
