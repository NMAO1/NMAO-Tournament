-- ============================================================================
-- Custom in-house divisions: each school configures its own Age groups and Rank
-- levels per tournament (two dropdowns at registration). Replaces the hardcoded
-- age/skill lists. Sensible defaults are seeded so a tournament works out of the
-- box; the school edits them in the In-house setup panel.
-- ============================================================================

alter table public.in_house_tournaments
  add column if not exists division_ages  text[] not null default array['Ages 7–9','Ages 10–12','Ages 13–15','Ages 16–17','Ages 18+'],
  add column if not exists division_ranks text[] not null default array['Beginner','Intermediate','Advanced'];

-- Backfill any existing tournaments that predate these columns with the defaults.
update public.in_house_tournaments
   set division_ages  = array['Ages 7–9','Ages 10–12','Ages 13–15','Ages 16–17','Ages 18+']
 where division_ages is null or cardinality(division_ages) = 0;
update public.in_house_tournaments
   set division_ranks = array['Beginner','Intermediate','Advanced']
 where division_ranks is null or cardinality(division_ranks) = 0;

comment on column public.in_house_tournaments.division_ages  is 'School-defined age-group division options shown at registration.';
comment on column public.in_house_tournaments.division_ranks is 'School-defined rank/level division options shown at registration.';
