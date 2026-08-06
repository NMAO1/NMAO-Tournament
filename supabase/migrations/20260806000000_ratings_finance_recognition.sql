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
