-- In-house "say-on-camera" integrity password (Brad 2026-10-18). A school sets a
-- short phrase (customizable, or rolled from a randomizer in the creator) for a
-- VIDEO in-house tournament. Competitors say it on camera so the judge can
-- confirm the clip is a single, recent take. Shown to the competitor on upload
-- and to the judge in Run Tournament, where the judge can flag whether it was
-- said. Owner CRUD already covers these columns via the in-house owner RLS.
alter table public.in_house_tournaments add column if not exists password text;
-- null = not yet reviewed · true = said the password · false = missing/wrong
alter table public.ih_entrants add column if not exists password_verified boolean;
