-- =====================================================================
-- NMAO Tournament Engine — core data model
-- Migration 2 of 3: tournament_engine
--
-- Ordering: runs AFTER 20260804000000_base_reference_people.sql (which
-- creates competitors / judges / schools) and BEFORE
-- 20260806000000_ratings_finance_recognition.sql (which references the
-- rounds / entries / divisions this file creates).
--
-- Existing tables this file references (provided by migration 1):
--   public.competitors(id uuid)  — the athletes
--   public.judges(id uuid)       — judges (carry judges.school_id for conflicts)
--   public.schools(id uuid)      — dojos / schools
--
-- Scheme-driven values (event, age bracket, rank) are stored as TEXT keys
-- that must match the keys defined in division_schemes.axes. The engine
-- treats the Division Scheme as the single source of categories, so these
-- are deliberately NOT enums — new brackets/tiers/events are a config edit.
-- Only the fixed engine state machines are enums.
-- =====================================================================

-- ---------- Enums (fixed engine state machines only) ----------
create type round_state as enum
  ('open','collecting','closed','classified','collapsed',
   'podded','judging','resolving','distributed','finalized');
create type entry_status     as enum ('submitted','valid','voided');
create type pod_state        as enum ('forming','judging','resolved');
create type judge_role       as enum ('sole','panel');
create type assignment_state as enum ('assigned','submitted','reopened');

-- ---------- updated_at helper ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- seasons ----------
create table seasons (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  status           text not null default 'draft',        -- draft|active|archived
  config           jsonb not null default '{}'::jsonb,
  active_scheme_id uuid,                                  -- FK added after division_schemes
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- division_schemes (versioned, immutable once locked) ----------
create table division_schemes (
  id                   uuid primary key default gen_random_uuid(),
  season_id            uuid not null references seasons(id) on delete cascade,
  version              int  not null,
  axes                 jsonb not null,                    -- see engine spec §5
  pod_cap              int  not null default 20,
  pod_split_threshold  int  not null default 22,
  pod_floor            int  not null default 6,
  collapse_order       jsonb not null default '["rank","age"]'::jsonb,
  locked               boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (season_id, version),
  check (pod_split_threshold >= pod_cap),
  check (pod_floor >= 1)
);

alter table seasons
  add constraint seasons_active_scheme_fk
  foreign key (active_scheme_id) references division_schemes(id);

-- ---------- rounds ----------
create table rounds (
  id               uuid primary key default gen_random_uuid(),
  season_id        uuid not null references seasons(id) on delete cascade,
  seq              int  not null,                         -- 1..9 qualifying; higher = semi/final
  scheme_id        uuid not null references division_schemes(id),
  state            round_state not null default 'open',
  opens_at         timestamptz,
  closes_at        timestamptz,
  judging_deadline timestamptz,
  locked_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (season_id, seq)
);

-- ---------- divisions ----------
create table divisions (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references rounds(id) on delete cascade,
  event          text not null,
  age_key        text not null,
  rank_key       text not null,
  is_collapsed   boolean not null default false,
  collapsed_from jsonb not null default '[]'::jsonb,      -- base division keys merged in
  entry_count    int  not null default 0,
  created_at     timestamptz not null default now(),
  unique (round_id, event, age_key, rank_key)
);

-- ---------- pods ----------
create table pods (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references divisions(id) on delete cascade,
  seq          int  not null,
  size         int  not null default 0,
  state        pod_state not null default 'forming',
  judge_count  int  not null default 1,                   -- 1 (beg/int) or 3 (advanced)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (division_id, seq)
);

-- ---------- entries ----------
create table entries (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references rounds(id) on delete cascade,
  competitor_id   uuid not null references competitors(id),
  event           text not null,
  age_bracket     text not null,
  declared_rank   text not null,
  rating_at_entry numeric(8,2),
  video_url       text,
  division_id     uuid references divisions(id) on delete set null,
  pod_id          uuid references pods(id) on delete set null,
  status          entry_status not null default 'submitted',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (round_id, competitor_id, event)                 -- one entry per event per round
);

-- ---------- judge_assignments (per video: pod + entry + judge) ----------
create table judge_assignments (
  id           uuid primary key default gen_random_uuid(),
  pod_id       uuid not null references pods(id) on delete cascade,
  entry_id     uuid not null references entries(id) on delete cascade,
  judge_id     uuid not null references judges(id),
  role         judge_role not null default 'sole',
  state        assignment_state not null default 'assigned',
  score        numeric(6,2),
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (entry_id, judge_id)
);

-- ---------- results ----------
create table results (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references entries(id) on delete cascade,
  pod_id       uuid not null references pods(id) on delete cascade,
  score        numeric(6,2),
  placement    int,
  rating_delta numeric(8,2),
  rating_after numeric(8,2),
  created_at   timestamptz not null default now(),
  unique (entry_id)
);

-- ---------- round_step_runs (idempotency for engine steps) ----------
create table round_step_runs (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references rounds(id) on delete cascade,
  step         text not null,   -- classify|collapse|form_pods|assign_judges|resolve|distribute
  status       text not null default 'pending',           -- pending|running|done|error
  detail       jsonb,
  started_at   timestamptz,
  completed_at timestamptz,
  unique (round_id, step)
);

-- ---------- engine_audit (overrides & rollbacks) ----------
create table engine_audit (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid references rounds(id) on delete cascade,
  actor_id    uuid,                                        -- operator/admin user
  action      text not null,       -- move|merge|split|reassign|void|rollback
  target_type text,                -- entry|pod|division|judge_assignment
  target_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- indexes ----------
create index idx_entries_round      on entries(round_id);
create index idx_entries_division   on entries(division_id);
create index idx_entries_pod        on entries(pod_id);
create index idx_entries_competitor on entries(competitor_id);
create index idx_divisions_round    on divisions(round_id);
create index idx_pods_division      on pods(division_id);
create index idx_ja_pod             on judge_assignments(pod_id);
create index idx_ja_judge           on judge_assignments(judge_id);
create index idx_ja_entry           on judge_assignments(entry_id);
create index idx_results_pod        on results(pod_id);
create index idx_rounds_season      on rounds(season_id);

-- ---------- updated_at triggers ----------
create trigger trg_seasons_updated before update on seasons
  for each row execute function set_updated_at();
create trigger trg_rounds_updated before update on rounds
  for each row execute function set_updated_at();
create trigger trg_pods_updated before update on pods
  for each row execute function set_updated_at();
create trigger trg_entries_updated before update on entries
  for each row execute function set_updated_at();
create trigger trg_ja_updated before update on judge_assignments
  for each row execute function set_updated_at();

-- ---------- RLS ----------
-- Engine runs via the service role (bypasses RLS). Add per-role read/write
-- policies for the competitor / school / judge apps in a follow-up migration.
alter table seasons           enable row level security;
alter table division_schemes  enable row level security;
alter table rounds            enable row level security;
alter table divisions         enable row level security;
alter table pods              enable row level security;
alter table entries           enable row level security;
alter table judge_assignments enable row level security;
alter table results           enable row level security;
alter table round_step_runs   enable row level security;
alter table engine_audit      enable row level security;
