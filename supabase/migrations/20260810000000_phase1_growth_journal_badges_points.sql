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
