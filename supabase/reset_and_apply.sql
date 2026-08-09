-- =====================================================================
-- NMAO Tournament — RESET + full schema (run this ONCE).
-- Safe on a project with NO real data: it clears any partial apply, then
-- rebuilds the whole schema cleanly. Paste into the Supabase SQL Editor → Run.
-- GENERATED — do not edit by hand (edit migrations, then regenerate).
-- =====================================================================

-- ---- reset (remove partial apply) ----
drop schema if exists nmao cascade;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions  to postgres, anon, authenticated, service_role;

-- =====================================================================
-- NMAO Tournament — full schema, all migrations in order.
-- GENERATED from supabase/migrations/*.sql — do not edit by hand.
-- Files: 20260804000000_base_reference_people.sql, 20260805120000_tournament_engine.sql, 20260806000000_ratings_finance_recognition.sql, 20260807000000_rls_policies.sql, 20260808000000_per_criterion_scoring.sql, 20260809000000_idempotency_hardening.sql, 20260810000000_motivational_sayings.sql, 20260810000100_reveal_sayings.sql
-- =====================================================================


-- ===================== 20260804000000_base_reference_people.sql =====================
-- =====================================================================
-- NMAO Tournaments — Migration 1 of 3: base reference + people/org
-- Reconciled schema (2026-08-06). Applies BEFORE the tournament engine.
--
-- Ordering (all three must run in this order):
--   1. 20260804000000_base_reference_people.sql   <- this file
--   2. 20260805120000_tournament_engine.sql       (rounds/entries/pods/results/…)
--   3. 20260806000000_ratings_finance_recognition.sql (skill_ratings/medals/…)
--
-- Reconciliation notes:
--   - The engine schema (file 2) is the source of truth for the competition
--     structure. The earlier 001 schema's forked tables (its own seasons,
--     tournaments, divisions, pods, submissions, submission_scores,
--     deductions, judge_assignments) are DROPPED — superseded by the engine.
--   - Scoring is the LOCKED single-score model (docs/scoring-and-rating.md):
--     one 0-100 score per judge, stored on judge_assignments (file 2). The
--     per-criterion rubric persistence (submission_scores/deductions) is
--     therefore gone. `criteria` + `rubric_weights` are KEPT as reference
--     data to guide judges toward their 0-100 score (used by the judge UI).
--   - judges gain `school_id` so own-school conflict exclusion has data.
-- =====================================================================

begin;

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- =====================================================================
-- 1. REFERENCE TABLES (seeded at the end)
-- =====================================================================
create table if not exists event_types (
  code       text primary key,
  name       text not null,
  discipline text not null check (discipline in ('forms','weapons')),
  style      text not null check (style in ('traditional','open'))
);

-- Reference bracket labels (the live division bracketing is scheme-driven in
-- the engine's division_schemes.axes; this table is descriptive reference).
create table if not exists age_brackets (
  code    text primary key,
  min_age int  not null,
  max_age int,
  label   text not null,
  check (max_age is null or max_age >= min_age)
);

create table if not exists criteria (
  code        text primary key,
  name        text not null,
  description text,
  sort_order  int  not null default 0
);

create table if not exists rubric_weights (
  style          text not null check (style in ('traditional','open')),
  criterion_code text not null references criteria(code),
  weight_pct     numeric(5,2) not null check (weight_pct >= 0 and weight_pct <= 100),
  primary key (style, criterion_code)
);

create table if not exists app_settings (
  key   text primary key,
  value jsonb not null
);

-- =====================================================================
-- 2. PEOPLE & ORGANIZATIONS
-- =====================================================================
create table if not exists schools (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  slug                      text unique,
  contact_name              text,
  contact_email             text,
  contact_email_norm        text generated always as (lower(trim(contact_email))) stored,
  phone                     text,
  address                   jsonb,
  country                   text default 'US',
  stripe_connect_account_id text,
  payout_tier               int,
  status                    text not null default 'active',
  created_at                timestamptz not null default now()
);

create table if not exists competitors (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references schools(id),
  first_name     text not null,
  last_name      text not null,
  dob            date not null,
  declared_style text,
  declared_rank  text check (declared_rank in ('beginner','intermediate','advanced','black_belt')),
  email          text,
  email_norm     text generated always as (lower(trim(email))) stored,
  auth_user_id   uuid,
  status         text not null default 'active',
  created_at     timestamptz not null default now()
);

create table if not exists guardians (
  id           uuid primary key default gen_random_uuid(),
  first_name   text,
  last_name    text,
  email        text,
  email_norm   text generated always as (lower(trim(email))) stored,
  phone        text,
  auth_user_id uuid,
  created_at   timestamptz not null default now()
);

create table if not exists guardian_competitors (
  guardian_id   uuid not null references guardians(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  relationship  text,
  primary key (guardian_id, competitor_id)
);

create table if not exists judges (
  id                      uuid primary key default gen_random_uuid(),
  first_name              text,
  last_name               text,
  email                   text,
  email_norm              text generated always as (lower(trim(email))) stored,
  auth_user_id            uuid,
  school_id               uuid references schools(id),   -- conflict-of-interest source (own-school exclusion)
  years_experience        int,
  certified_at            timestamptz,
  background_check_status text not null default 'pending'
                          check (background_check_status in ('pending','cleared','rejected')),
  hourly_rate_cents       int not null default 2500,
  status                  text not null default 'active',
  created_at              timestamptz not null default now()
);

create table if not exists staff (
  id           uuid primary key default gen_random_uuid(),
  first_name   text,
  last_name    text,
  email        text,
  email_norm   text generated always as (lower(trim(email))) stored,
  auth_user_id uuid,
  role         text not null default 'organizer' check (role in ('owner','admin','organizer')),
  permissions  jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

-- Verifiable-consent records (COPPA / participation waiver). Kept here in the
-- base because it only depends on competitors + guardians.
create table if not exists consents (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  guardian_id   uuid references guardians(id),
  type          text not null check (type in ('coppa_media','participation_waiver')),
  agreed_at     timestamptz not null default now(),
  ip            text
);

-- =====================================================================
-- 3. INDEXES
-- =====================================================================
create index if not exists idx_competitors_school     on competitors(school_id);
create index if not exists idx_competitors_email_norm  on competitors(email_norm);
create index if not exists idx_competitors_auth        on competitors(auth_user_id);
create index if not exists idx_guardians_email_norm    on guardians(email_norm);
create index if not exists idx_judges_email_norm       on judges(email_norm);
create index if not exists idx_judges_auth             on judges(auth_user_id);
create index if not exists idx_judges_school           on judges(school_id);
create index if not exists idx_staff_email_norm        on staff(email_norm);
create index if not exists idx_consents_competitor     on consents(competitor_id);

-- =====================================================================
-- 4. RUBRIC-WEIGHT INTEGRITY: each style must sum to 100 (reference guard)
-- =====================================================================
create or replace function enforce_rubric_weight_sum() returns trigger
language plpgsql as $$
declare
  s text;
  total numeric;
begin
  s := coalesce(new.style, old.style);
  select coalesce(sum(weight_pct),0) into total from rubric_weights where style = s;
  if total <> 100 then
    raise exception 'rubric_weights for style "%" must sum to 100 (got %)', s, total;
  end if;
  return null;
end $$;

drop trigger if exists trg_rubric_weight_sum on rubric_weights;
create constraint trigger trg_rubric_weight_sum
  after insert or update or delete on rubric_weights
  deferrable initially deferred
  for each row execute function enforce_rubric_weight_sum();

-- =====================================================================
-- 5. REFERENCE-DATA SEEDS (idempotent)
-- =====================================================================
insert into event_types (code, name, discipline, style) values
  ('trad_forms',   'Traditional Forms',   'forms',   'traditional'),
  ('trad_weapons', 'Traditional Weapons', 'weapons', 'traditional'),
  ('open_forms',   'Open Forms',          'forms',   'open'),
  ('open_weapons', 'Open Weapons',        'weapons', 'open')
on conflict (code) do nothing;

insert into age_brackets (code, min_age, max_age, label) values
  ('7_9',    7,  9,    '7–9'),
  ('10_12', 10, 12,    '10–12'),
  ('13_15', 13, 15,    '13–15'),
  ('16_17', 16, 17,    '16–17'),
  ('18_plus',18, null,  '18+')
on conflict (code) do nothing;

insert into criteria (code, name, description, sort_order) values
  ('technical',  'Technical Execution',         'Precision of stances, strikes, blocks, targeting, chambering. (Weapons: control & manipulation accuracy.)', 1),
  ('power',      'Power & Focus (Kime)',        'Power generation and control, clear focus points, snap/retraction.', 2),
  ('balance',    'Balance, Stability & Rooting', 'Controlled weight transfer, strong base, no wobbles/steps-out.', 3),
  ('timing',     'Timing, Rhythm & Fluidity',   'Pacing, dynamic tension vs. relaxation, clean transitions.', 4),
  ('spirit',     'Spirit & Presentation',       'Intent, kiai, confidence, command of the camera.', 5),
  ('difficulty', 'Difficulty & Composition',    'Difficulty attempted; for Open includes creativity/originality; for weapons, manipulation complexity.', 6)
on conflict (code) do nothing;

insert into rubric_weights (style, criterion_code, weight_pct) values
  ('traditional','technical', 25),
  ('traditional','power',     20),
  ('traditional','balance',   20),
  ('traditional','timing',    15),
  ('traditional','spirit',    12),
  ('traditional','difficulty', 8),
  ('open','technical', 20),
  ('open','power',     15),
  ('open','balance',   15),
  ('open','timing',    15),
  ('open','spirit',    15),
  ('open','difficulty',20)
on conflict (style, criterion_code) do nothing;

insert into app_settings (key, value) values
  ('entry_fee_cents',      '4500'::jsonb),
  ('currency',             '"usd"'::jsonb),
  ('pod_cap',              '20'::jsonb),
  ('pod_split_threshold',  '22'::jsonb),
  ('provisional_rounds',   '3'::jsonb),
  ('championship_setaside_pct', '8'::jsonb)
on conflict (key) do nothing;

commit;

-- ===================== 20260805120000_tournament_engine.sql =====================
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

-- ===================== 20260806000000_ratings_finance_recognition.sql =====================
-- =====================================================================
-- NMAO Tournaments — Migration 3 of 3: ratings, finance & recognition
-- Reconciled schema (2026-08-06). Applies AFTER the tournament engine, so it
-- can reference the engine's rounds / entries / divisions / seasons.
--
-- Everything here is repointed onto the engine's tables (the earlier 001
-- versions referenced tournaments/submissions, which are gone). Ratings use
-- the LOCKED model: a 0-100 number seeded at 50 (docs/scoring-and-rating.md).
-- =====================================================================

begin;

-- ---------- skill_ratings (persistent carry-over rating per competitor) ----------
-- Seeded at 50 to match the locked rating rule; events_count drives the
-- provisional K (8 for the first 3 rounds, then 4).
create table if not exists skill_ratings (
  competitor_id uuid primary key references competitors(id) on delete cascade,
  rating        numeric(6,3) not null default 50,
  events_count  int  not null default 0,
  provisional   boolean not null default true,
  last_event_at timestamptz,
  updated_at    timestamptz not null default now()
);

-- ---------- rating_history (one row per rated entry, fully auditable) ----------
-- k_factor is the locked learning rate (8 or 4); opponents = same-rank
-- podmates the move was measured against (see scoring-and-rating.md §7).
create table if not exists rating_history (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  round_id      uuid references rounds(id) on delete set null,
  entry_id      uuid references entries(id) on delete set null,
  rating_before numeric(6,3),
  rating_after  numeric(6,3),
  rating_delta  numeric(6,3),
  opponents     int,
  k_factor      numeric(5,2),
  created_at    timestamptz not null default now()
);

-- ---------- season_results (standings feed: best 6 of 9) ----------
create table if not exists season_results (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references seasons(id) on delete cascade,
  round_id      uuid not null references rounds(id) on delete cascade,
  entry_id      uuid references entries(id) on delete set null,
  competitor_id uuid not null references competitors(id) on delete cascade,
  event         text not null,
  age_key       text,
  score         numeric(6,2),
  placement     int,
  created_at    timestamptz not null default now(),
  unique (round_id, competitor_id, event)
);

-- ---------- medals (everyone gets a participation segment; top-3 add a placement medal) ----------
create table if not exists medals (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds(id) on delete cascade,
  division_id   uuid references divisions(id) on delete set null,
  entry_id      uuid references entries(id) on delete set null,
  competitor_id uuid not null references competitors(id) on delete cascade,
  event         text not null,
  medal_type    text not null check (medal_type in ('gold','silver','bronze','participation')),
  placement     int,
  ship_status   text not null default 'pending' check (ship_status in ('pending','printed','shipped')),
  created_at    timestamptz not null default now()
);

-- ---------- medal_shipments (one grouped box per school; persists the ship list) ----------
create table if not exists medal_shipments (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references rounds(id) on delete cascade,
  school_id    uuid not null references schools(id),
  item_count   int  not null default 0,
  manifest     jsonb not null default '{}'::jsonb,   -- the buildShipList() output for this school
  ship_status  text not null default 'pending' check (ship_status in ('pending','printed','shipped')),
  ship_address jsonb,
  created_at   timestamptz not null default now(),
  unique (round_id, school_id)
);

-- ---------- payments (entry fees) ----------
create table if not exists payments (
  id                       uuid primary key default gen_random_uuid(),
  entry_id                 uuid references entries(id) on delete set null,
  competitor_id            uuid references competitors(id),
  school_id                uuid references schools(id),
  stripe_payment_intent_id text,
  amount_cents             int  not null,
  currency                 text not null default 'usd',
  status                   text not null default 'pending'
                           check (status in ('pending','succeeded','failed','refunded')),
  created_at               timestamptz not null default now()
);

-- ---------- school_payouts (tiered revenue share) ----------
create table if not exists school_payouts (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id),
  season_id          uuid references seasons(id) on delete set null,
  period             text,
  entries_count      int,
  amount_cents       int,
  stripe_transfer_id text,
  status             text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at         timestamptz not null default now()
);

-- ---------- content_reports (moderation of minors' video) ----------
create table if not exists content_reports (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid references entries(id) on delete set null,
  reporter   text,
  reason     text,
  status     text not null default 'open' check (status in ('open','reviewed','removed','dismissed')),
  created_at timestamptz not null default now()
);

-- ---------- indexes ----------
create index if not exists idx_ratinghist_competitor    on rating_history(competitor_id);
create index if not exists idx_ratinghist_round         on rating_history(round_id);
create index if not exists idx_seasonresults_season     on season_results(season_id);
create index if not exists idx_seasonresults_competitor on season_results(competitor_id);
create index if not exists idx_medals_round             on medals(round_id);
create index if not exists idx_medals_competitor        on medals(competitor_id);
create index if not exists idx_medalship_round          on medal_shipments(round_id);
create index if not exists idx_medalship_school         on medal_shipments(school_id);
create index if not exists idx_payments_entry           on payments(entry_id);
create index if not exists idx_payouts_school           on school_payouts(school_id);
create index if not exists idx_reports_entry            on content_reports(entry_id);

-- ---------- RLS (deny-by-default; engine runs as service role) ----------
alter table skill_ratings   enable row level security;
alter table rating_history  enable row level security;
alter table season_results  enable row level security;
alter table medals          enable row level security;
alter table medal_shipments enable row level security;
alter table payments        enable row level security;
alter table school_payouts  enable row level security;
alter table content_reports enable row level security;

commit;

-- ===================== 20260807000000_rls_policies.sql =====================
-- =====================================================================
-- NMAO Tournaments — Migration 4 of 4: Row-Level Security policies
-- Reconciled schema (2026-08-06). Applies AFTER the base, engine, and
-- ratings/finance migrations.
--
-- Posture: deny-by-default RLS on every table. The engine runs as the
-- Supabase service role, which BYPASSES RLS — so all engine writes work
-- without per-table write policies. These policies govern the three spoke
-- apps (competitor, judge, school) plus NMAO staff/operators.
--
-- IDENTITY MODEL (assumptions — confirm with Bradley; handoff §3 left this
-- [TO DEFINE]):
--   - Supabase Auth. A person is linked to their auth user via the
--     `auth_user_id` column already on competitors / guardians / judges / staff.
--   - A GUARDIAN acts on behalf of their linked competitors (guardian_competitors).
--   - A JUDGE is a row in `judges` whose auth_user_id = auth.uid().
--   - STAFF (owner/admin/organizer) are NMAO operators with broad read.
--   - The SCHOOL app has no school↔auth mapping yet, so school-scoped
--     self-service is deferred (school data is staff-only for now). This is
--     the main open item to close before the school app ships.
-- =====================================================================

begin;

-- ---------- helper schema + functions (SECURITY DEFINER to avoid recursive RLS) ----------
create schema if not exists nmao;

create or replace function nmao.is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff s where s.auth_user_id = auth.uid());
$$;

-- Competitor ids the current user may act as: themselves + any competitor
-- they are the guardian of.
create or replace function nmao.competitor_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select c.id from competitors c where c.auth_user_id = auth.uid()
  union
  select gc.competitor_id
    from guardian_competitors gc
    join guardians g on g.id = gc.guardian_id
   where g.auth_user_id = auth.uid();
$$;

create or replace function nmao.judge_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select j.id from judges j where j.auth_user_id = auth.uid() limit 1;
$$;

-- ---------- enable RLS on base + reference tables (engine + ratings already on) ----------
alter table event_types          enable row level security;
alter table age_brackets         enable row level security;
alter table criteria             enable row level security;
alter table rubric_weights       enable row level security;
alter table app_settings         enable row level security;
alter table schools              enable row level security;
alter table competitors          enable row level security;
alter table guardians            enable row level security;
alter table guardian_competitors enable row level security;
alter table judges               enable row level security;
alter table staff                enable row level security;
alter table consents             enable row level security;

-- =====================================================================
-- Reference + public tournament structure: readable by any authenticated user.
-- (Writes have no policy -> service-role-only.)
-- =====================================================================
create policy ref_read_event_types    on event_types      for select to authenticated using (true);
create policy ref_read_age_brackets   on age_brackets     for select to authenticated using (true);
create policy ref_read_criteria       on criteria         for select to authenticated using (true);
create policy ref_read_rubric_weights on rubric_weights   for select to authenticated using (true);
create policy ref_read_app_settings   on app_settings     for select to authenticated using (true);
create policy pub_read_seasons        on seasons          for select to authenticated using (true);
create policy pub_read_schemes        on division_schemes for select to authenticated using (true);
create policy pub_read_rounds         on rounds           for select to authenticated using (true);
create policy pub_read_divisions      on divisions        for select to authenticated using (true);
create policy pub_read_pods           on pods             for select to authenticated using (true);

-- =====================================================================
-- People / org
-- =====================================================================
-- Schools: a user reads their own school (as competitor or judge); staff read all.
create policy school_read on schools for select to authenticated
  using (
    nmao.is_staff()
    or id in (select c.school_id from competitors c where c.id in (select nmao.competitor_ids()))
    or id = (select j.school_id from judges j where j.id = nmao.judge_id())
  );

-- Competitors: the user (or their guardian) reads their own competitor rows; staff all.
create policy competitor_read on competitors for select to authenticated
  using (id in (select nmao.competitor_ids()) or nmao.is_staff());

-- Guardians: read/manage own guardian row; staff all.
create policy guardian_read on guardians for select to authenticated
  using (auth_user_id = auth.uid() or nmao.is_staff());

create policy guardian_link_read on guardian_competitors for select to authenticated
  using (
    competitor_id in (select nmao.competitor_ids())
    or guardian_id in (select g.id from guardians g where g.auth_user_id = auth.uid())
    or nmao.is_staff()
  );

-- Judges: read/update own judge row; staff all.
create policy judge_read on judges for select to authenticated
  using (auth_user_id = auth.uid() or nmao.is_staff());

-- Staff: a staffer reads their own row; staff read all.
create policy staff_read on staff for select to authenticated
  using (auth_user_id = auth.uid() or nmao.is_staff());

-- Consents: guardian/competitor see their own; guardian may insert; staff all.
create policy consent_read on consents for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());
create policy consent_insert on consents for insert to authenticated
  with check (competitor_id in (select nmao.competitor_ids()));

-- =====================================================================
-- Entries: competitor/guardian see & submit their own; a judge sees entries
-- assigned to them (to view the video); staff all.
-- =====================================================================
create policy entry_read on entries for select to authenticated
  using (
    competitor_id in (select nmao.competitor_ids())
    or nmao.is_staff()
    or exists (
      select 1 from judge_assignments ja
       where ja.entry_id = entries.id and ja.judge_id = nmao.judge_id()
    )
  );
create policy entry_insert on entries for insert to authenticated
  with check (competitor_id in (select nmao.competitor_ids()));

-- =====================================================================
-- Judge assignments: a judge sees only their own assignments and may update
-- them (to submit a score). Staff read all. (Column-level restriction of
-- which fields a judge may change is enforced by grants / the edge layer.)
-- =====================================================================
create policy ja_read on judge_assignments for select to authenticated
  using (judge_id = nmao.judge_id() or nmao.is_staff());
create policy ja_update on judge_assignments for update to authenticated
  using (judge_id = nmao.judge_id())
  with check (judge_id = nmao.judge_id());

-- =====================================================================
-- Results / ratings / recognition / payments: competitor-or-guardian scoped.
-- =====================================================================
create policy results_read on results for select to authenticated
  using (
    nmao.is_staff()
    or exists (select 1 from entries e where e.id = results.entry_id
                and e.competitor_id in (select nmao.competitor_ids()))
  );

create policy skillrating_read on skill_ratings for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy ratinghist_read on rating_history for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy seasonresults_read on season_results for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy medals_read on medals for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create policy payments_read on payments for select to authenticated
  using (
    nmao.is_staff()
    or competitor_id in (select nmao.competitor_ids())
  );

-- =====================================================================
-- Staff-only tables (operations & moderation). No policy for other roles
-- means deny; service role still bypasses.
-- =====================================================================
create policy audit_staff       on engine_audit      for select to authenticated using (nmao.is_staff());
create policy steprun_staff     on round_step_runs   for select to authenticated using (nmao.is_staff());
create policy shipments_staff   on medal_shipments   for select to authenticated using (nmao.is_staff());
create policy payouts_staff     on school_payouts    for select to authenticated using (nmao.is_staff());
create policy reports_staff     on content_reports   for select to authenticated using (nmao.is_staff());

-- =====================================================================
-- Grants. RLS filters rows; roles still need table privileges. Supabase
-- pre-creates the anon / authenticated / service_role roles.
-- =====================================================================
grant usage on schema public, nmao to authenticated, service_role;
grant execute on all functions in schema nmao to authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant insert on entries, consents to authenticated;
grant update on judge_assignments to authenticated;
grant all on all tables in schema public to service_role;

commit;

-- ===================== 20260808000000_per_criterion_scoring.sql =====================
-- =====================================================================
-- NMAO Tournaments — Migration 5 of 5: per-criterion judge scoring (A6)
-- Applies AFTER the RLS migration (uses nmao.judge_id() / nmao.is_staff()).
--
-- Judges score one field per criterion (the 6 in `criteria`), weighted by the
-- event's style profile (Traditional vs Open) in `rubric_weights`. The video's
-- per-judge score is the weighted combination (see functions/_shared/rating.ts
-- weightedJudgeScore + docs/scoring-and-rating.md §1) and is stored on
-- judge_assignments.score, so resolve/placement/rating are unchanged. These
-- per-criterion rows keep every score auditable back to the rubric.
-- =====================================================================

begin;

create table if not exists submission_scores (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references entries(id) on delete cascade,
  judge_id       uuid not null references judges(id),
  criterion_code text not null references criteria(code),
  raw_score      numeric(6,2) not null check (raw_score >= 0 and raw_score <= 100),
  created_at     timestamptz not null default now(),
  unique (entry_id, judge_id, criterion_code)
);

create index if not exists idx_subscores_entry on submission_scores(entry_id);
create index if not exists idx_subscores_judge on submission_scores(judge_id);

alter table submission_scores enable row level security;

-- A judge reads and writes their own per-criterion scores; staff read all.
create policy subscore_judge_read on submission_scores for select to authenticated
  using (judge_id = nmao.judge_id() or nmao.is_staff());
create policy subscore_judge_insert on submission_scores for insert to authenticated
  with check (judge_id = nmao.judge_id());
create policy subscore_judge_update on submission_scores for update to authenticated
  using (judge_id = nmao.judge_id())
  with check (judge_id = nmao.judge_id());

grant select, insert, update on submission_scores to authenticated;
grant all on submission_scores to service_role;

commit;

-- ===================== 20260809000000_idempotency_hardening.sql =====================
-- =====================================================================
-- Idempotency hardening for the round pipeline (engine step-runner).
--
--  1. claim_step(): atomically claim a pipeline step so a concurrent
--     double-fire (cron + operator button, or a retry while the first run
--     is mid-flight) cannot execute resolve/distribute twice. Replaces the
--     racy read-status-then-set-'running' guard in engine.ts.
--
--  2. rating_history: one row per rated entry, so saveRatingUpdates can
--     UPSERT (idempotent) instead of INSERT — a re-run can no longer create
--     duplicate history rows or double-count skill_ratings.events_count.
--
-- Safe/reversible: creating a function and a unique index; no data changes.
-- NOTE: the unique index will fail if rating_history already contains rows
-- with duplicate entry_id (only possible from a prior double-run in testing);
-- dedupe those first if so. Fresh/pre-production DBs are unaffected.
-- =====================================================================

-- (2) One rating_history row per rated entry — the UPSERT conflict target.
create unique index if not exists rating_history_entry_uk
  on rating_history (entry_id);

-- (1) Atomically claim a pipeline step.
-- Returns true ONLY to the caller that wins the claim (row absent, or its
-- status is 'pending'/'error'); returns false if another worker already
-- holds it ('running') or it is already 'done'. The single INSERT ... ON
-- CONFLICT ... WHERE statement takes the row lock, so it is race-free.
create or replace function public.claim_step(p_round_id uuid, p_step text)
returns boolean
language plpgsql
as $$
declare
  claimed boolean;
begin
  insert into round_step_runs (round_id, step, status, started_at)
  values (p_round_id, p_step, 'running', now())
  on conflict (round_id, step) do update
      set status = 'running', started_at = now()
    where round_step_runs.status not in ('running', 'done')
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

grant execute on function public.claim_step(uuid, text) to service_role;

-- ===================== 20260810000000_motivational_sayings.sql =====================
-- =====================================================================
-- motivational_sayings — shown at the reveal to competitors who did NOT
-- place 1st/2nd/3rd (docs/competitor-growth-and-badges.md §2). Content is
-- seeded separately via supabase/seed_sayings.sql.
-- =====================================================================
create table if not exists motivational_sayings (
  id         uuid primary key default gen_random_uuid(),
  seq        int  unique,
  text       text not null unique,
  author     text,
  theme      text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table motivational_sayings enable row level security;

-- Public, non-sensitive content: any signed-in user (competitor/guardian) may
-- read active sayings. The service role bypasses RLS for the reveal function.
drop policy if exists motivational_sayings_read on motivational_sayings;
create policy motivational_sayings_read on motivational_sayings
  for select to authenticated using (active);

-- ===================== 20260810000100_reveal_sayings.sql =====================
-- =====================================================================
-- Reveal wiring for motivational sayings.
-- A competitor who did NOT place 1st/2nd/3rd (placement > 3) is shown a
-- motivational saying at reveal (docs/competitor-growth-and-badges.md §2).
-- The saying is assigned at DISTRIBUTE time and stored on results.saying_id,
-- so the reveal is stable (same words each open) and non-repeating per
-- competitor across the season.
-- =====================================================================

alter table results
  add column if not exists saying_id uuid references motivational_sayings(id);

-- Assign a fresh saying to every non-placer in a round who doesn't have one.
-- "Fresh" = an active saying the competitor has not been assigned in any prior
-- result. Falls back to any active saying if they've somehow seen them all.
create or replace function assign_reveal_sayings(p_round_id uuid)
returns int
language plpgsql
as $$
declare
  n int := 0;
  r record;
  sid uuid;
begin
  for r in
    select res.id as result_id, e.competitor_id
    from results res
    join entries e on e.id = res.entry_id
    where e.round_id = p_round_id
      and res.placement > 3
      and res.saying_id is null
  loop
    select ms.id into sid
    from motivational_sayings ms
    where ms.active
      and ms.id not in (
        select r2.saying_id
        from results r2
        join entries e2 on e2.id = r2.entry_id
        where e2.competitor_id = r.competitor_id
          and r2.saying_id is not null
      )
    order by random()
    limit 1;

    if sid is null then
      select ms.id into sid from motivational_sayings ms
      where ms.active order by random() limit 1;
    end if;

    update results set saying_id = sid where id = r.result_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function assign_reveal_sayings(uuid) to service_role;



-- ===== migration: 20260810000000_phase1_growth_journal_badges_points.sql =====
-- =====================================================================
-- Phase-1 tables for the competitor app + judge onboarding + school controls.
--   • judges: IC/creed/Stripe-Connect onboarding fields
--   • competitors.total_points: lifetime effort accumulator
--   • round_virtues: the earned virtue per round (Imprint + Journey)
--   • mastery_path + mastery_events: lifetime, never-reset progression
--   • journal_entries: private growth journal (competitor + guardian only)
--   • badges + badge_awards: collectible catalog + per-competitor awards
--   • season_points: placement-standings ledger (seasonal)
--   • student_tournament_settings: School-Portal Admin-Powers toggles
-- RLS: competitor/guardian see their own via nmao.competitor_ids(); staff see all
-- via nmao.is_staff(); the service role bypasses (engine/EF writes). Reference data
-- (badges catalog) is readable by any authenticated user.
-- =====================================================================

-- ---------- judges: onboarding fields (judge app) ----------
-- (years_experience already exists; reuse it for "years of training".)
alter table judges
  add column if not exists styles                   text[],
  add column if not exists notable_mentions         text,
  add column if not exists creed_accepted_at        timestamptz,
  add column if not exists ic_agreement_accepted_at timestamptz,
  add column if not exists stripe_connect_account_id text;

-- ---------- competitors: lifetime total points (grows with every event) ----------
alter table competitors
  add column if not exists total_points numeric(12,2) not null default 0;

-- ---------- round_virtues ----------
create table if not exists round_virtues (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  round_id      uuid not null references rounds(id) on delete cascade,
  entry_id      uuid references entries(id) on delete set null,
  virtue        text not null,   -- Precision|Focus|Composure|Flow|Courage|Ambition|Perseverance|Resilience|Boldness|Devotion
  source        text,            -- criterion or behavior it was earned from
  created_at    timestamptz not null default now(),
  unique (competitor_id, round_id)
);
alter table round_virtues enable row level security;
create policy round_virtues_read on round_virtues for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

-- ---------- mastery_path + mastery_events (lifetime, never resets) ----------
create table if not exists mastery_path (
  competitor_id uuid primary key references competitors(id) on delete cascade,
  points        numeric(12,2) not null default 0,
  degree        int not null default 0,
  updated_at    timestamptz not null default now()
);
alter table mastery_path enable row level security;
create policy mastery_path_read on mastery_path for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());

create table if not exists mastery_events (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  source        text not null,   -- compete|personal_best|rising_floor|criterion_mastery|difficulty|advancement
  points        numeric(10,2) not null default 0,
  round_id      uuid references rounds(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table mastery_events enable row level security;
create policy mastery_events_read on mastery_events for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());
create index if not exists mastery_events_competitor_idx on mastery_events(competitor_id);

-- ---------- journal_entries (private: competitor + guardian only, NOT staff) ----------
create table if not exists journal_entries (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  round_id      uuid references rounds(id) on delete set null,
  prompt        text,
  body          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table journal_entries enable row level security;
create policy journal_read   on journal_entries for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()));
create policy journal_insert on journal_entries for insert to authenticated
  with check (competitor_id in (select nmao.competitor_ids()));
create policy journal_update on journal_entries for update to authenticated
  using (competitor_id in (select nmao.competitor_ids()))
  with check (competitor_id in (select nmao.competitor_ids()));
create policy journal_delete on journal_entries for delete to authenticated
  using (competitor_id in (select nmao.competitor_ids()));
create index if not exists journal_competitor_idx on journal_entries(competitor_id);

-- ---------- badges (reference catalog) + badge_awards ----------
-- NOTE: the badge CATALOG rows are being finalized separately; this is the table
-- shape from badge-catalog.md. Add columns (e.g., tier thresholds) if that design needs them.
create table if not exists badges (
  code        text primary key,   -- stable id, e.g. 'first_step'
  name        text not null,
  description text,
  category    text,
  rarity      text check (rarity in ('common','uncommon','rare','epic','legendary')),
  tiered      boolean not null default false,
  hidden      boolean not null default false,
  emblem_key  text,                -- art/icon key
  earn_rule   jsonb,               -- machine-readable earn condition
  sku         text,                -- links to the e-commerce pin/patch
  sort_order  int,
  active      boolean not null default true
);
alter table badges enable row level security;
create policy badges_read on badges for select to authenticated using (true);

create table if not exists badge_awards (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  badge_code    text not null references badges(code) on delete cascade,
  tier          text,             -- bronze|silver|gold for tiered badges
  round_id      uuid references rounds(id) on delete set null,
  awarded_at    timestamptz not null default now(),
  seen          boolean not null default false,   -- false → triggers the earn reveal
  unique (competitor_id, badge_code, tier)
);
alter table badge_awards enable row level security;
create policy badge_awards_read on badge_awards for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());
create policy badge_awards_seen on badge_awards for update to authenticated
  using (competitor_id in (select nmao.competitor_ids()))
  with check (competitor_id in (select nmao.competitor_ids()));
create index if not exists badge_awards_competitor_idx on badge_awards(competitor_id);

-- ---------- season_points (placement-standings ledger, resets seasonally) ----------
create table if not exists season_points (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  season_id     uuid not null references seasons(id) on delete cascade,
  round_id      uuid references rounds(id) on delete set null,
  points        numeric(10,2) not null default 0,
  reason        text,             -- placement|participation|bonus
  created_at    timestamptz not null default now()
);
alter table season_points enable row level security;
create policy season_points_read on season_points for select to authenticated
  using (competitor_id in (select nmao.competitor_ids()) or nmao.is_staff());
create index if not exists season_points_comp_season_idx on season_points(competitor_id, season_id);

-- ---------- student_tournament_settings (School Portal Admin-Powers toggles) ----------
create table if not exists student_tournament_settings (
  competitor_id     uuid primary key references competitors(id) on delete cascade,
  school_id         uuid not null references schools(id) on delete cascade,
  allowed_events    text[],       -- which event categories they may enter
  dueling_enabled   boolean not null default false,
  competition_class text check (competition_class in ('beginner','intermediate','advanced')),
  geo_exclude_miles int,          -- compete only vs schools > N miles away
  merch_enabled     boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table student_tournament_settings enable row level security;
-- Staff + the competitor/guardian may READ. Writes go through a gated edge function
-- that authorizes the caller as an admin of that school (service-role only here),
-- matching the "engine writes as service role" convention.
create policy sts_read on student_tournament_settings for select to authenticated
  using (nmao.is_staff() or competitor_id in (select nmao.competitor_ids()));
