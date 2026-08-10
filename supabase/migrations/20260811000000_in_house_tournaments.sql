-- =====================================================================
-- In-house tournaments: a school hosts its OWN local event (self-judged, own
-- prizes). Completely separate from the NMAO engine — results stay local and
-- have NO effect on NMAO rating/points/medals. Owner-managed via RLS.
-- =====================================================================
create table if not exists in_house_tournaments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references schools(id) on delete cascade,
  name        text not null,
  event_date  date,
  state       text not null default 'draft' check (state in ('draft', 'open', 'judging', 'complete')),
  visibility  text not null default 'school_only' check (visibility in ('school_only', 'public')),
  created_at  timestamptz not null default now()
);

create table if not exists ih_entrants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references in_house_tournaments(id) on delete cascade,
  competitor_id uuid references competitors(id) on delete set null,  -- roster athlete (optional)
  display_name  text,                                                -- fallback name
  event         text,
  division      text,          -- freeform, e.g. "10–12 · Advanced"
  score         numeric(5, 2),
  placement     int,
  prize         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_ih_entrants_tournament on ih_entrants(tournament_id);

alter table in_house_tournaments enable row level security;
alter table ih_entrants enable row level security;

-- Owner manages their school's in-house tournaments + entrants (full CRUD).
drop policy if exists iht_owner_all on in_house_tournaments;
create policy iht_owner_all on in_house_tournaments for all to authenticated
  using (school_id in (select nmao.owned_school_ids()))
  with check (school_id in (select nmao.owned_school_ids()));

drop policy if exists ihe_owner_all on ih_entrants;
create policy ihe_owner_all on ih_entrants for all to authenticated
  using (tournament_id in (select id from in_house_tournaments where school_id in (select nmao.owned_school_ids())))
  with check (tournament_id in (select id from in_house_tournaments where school_id in (select nmao.owned_school_ids())));
