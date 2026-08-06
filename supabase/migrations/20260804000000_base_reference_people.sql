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
