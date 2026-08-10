-- =====================================================================
-- In-house SCORING: "Run tournament" carousel. Schools score entrants on
-- either NMAO's preset criteria or their OWN custom criteria (1–10 named
-- fields, free numeric entry). Totals drive placements. Schools also control
-- whether unpaid entrants are allowed into the carousel.
-- =====================================================================

alter table in_house_tournaments
  add column if not exists scoring_mode  text not null default 'nmao'
    check (scoring_mode in ('nmao', 'custom')),
  add column if not exists criteria      text[],                     -- custom criterion names (scoring_mode='custom')
  add column if not exists include_unpaid boolean not null default false;  -- let unpaid entrants compete?

alter table ih_entrants
  add column if not exists scores jsonb;   -- { "<criterion>": <number> } per-criterion values; ih_entrants.score holds the total
