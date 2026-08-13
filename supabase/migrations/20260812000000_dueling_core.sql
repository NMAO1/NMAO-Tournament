-- ============================================================
-- Dueling — core data model (Phase 1 backbone)
-- Async 1-v-1 video duels judged by the community. Separate loop from the
-- monthly tournament (own leaderboard, rating, badges, seasons).
-- Spec: docs/DUELING-HANDOFF.md (§11 data model, §4 voting integrity).
--
-- This migration establishes SCHEMA + INTEGRITY only:
--   • tables: duels, duel_votes, duel_ratings, voter_stats, duel_memberships
--   • OPEN voting (decision 2026-08-13): anyone casts ONE vote per duel for
--     whoever they want — NO same-school / participant exclusion. Integrity =
--     one-vote-per-duel (unique), votes only while status='voting', watch-to-vote
--     (+ hidden tally, rate-limit, >=3 certify, scale/vote-caps in later slices).
-- State transitions (accept/decline/upload/open-voting) and the certify/close
-- engine (>=3 certify, majority -> sudden death -> deadlock, vote-queue,
-- stat/Elo updates) come in the next slice as SECURITY DEFINER RPCs + cron.
--
-- Identity helpers (existing): nmao.competitor_ids() setof uuid (caller's own
-- competitor + any children if guardian), nmao.is_staff(), nmao.owned_school_ids().
-- ============================================================

-- ---------- duels ----------
create table if not exists duels (
  id                uuid primary key default gen_random_uuid(),
  challenger_id     uuid not null references competitors(id) on delete cascade,
  opponent_id       uuid not null references competitors(id) on delete cascade,
  type              text not null check (type in ('kata','weapon')),
  status            text not null default 'pending'
                      check (status in ('pending','accepted','declined','cancelled',
                                        'live','voting','complete','no_contest')),
  -- moderation: a report auto-hides the duel from the community pool pending review
  moderation_status text not null default 'ok'
                      check (moderation_status in ('ok','under_review','removed')),
  -- videos reuse the Compete upload mechanism (entry-videos bucket); stored as
  -- object paths / signed-url sources. NOT FK'd to entries (those are round-bound).
  challenger_video  text,
  opponent_video    text,
  -- lifecycle deadlines (tunable; set by the transition RPCs)
  response_deadline timestamptz,   -- accept/decline window (default 48h)
  upload_deadline   timestamptz,   -- both upload within 72h of acceptance
  opens_vote_at     timestamptz,
  closes_vote_at    timestamptz,   -- voting window (default 48h)
  overtime_until    timestamptz,   -- sudden-death overtime (default 24h)
  extended          boolean not null default false,  -- auto-extended once under the vote minimum
  -- outcome
  winner_id         uuid references competitors(id),
  result            text check (result in ('challenger','opponent','draw','no_contest')),
  resolved_at       timestamptz,   -- set when the duel resolves; the END-OF-MONTH REVEAL and the
                                    -- dueling-season leaderboard batch badge awards on this (see §badges)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint duel_distinct_parties check (challenger_id <> opponent_id),
  constraint duel_winner_is_party  check (winner_id is null or winner_id in (challenger_id, opponent_id))
);

-- ---------- duel_votes (the integrity table) ----------
create table if not exists duel_votes (
  id                   uuid primary key default gen_random_uuid(),
  duel_id              uuid not null references duels(id) on delete cascade,
  voter_competitor_id  uuid not null references competitors(id) on delete cascade,
  choice               text not null check (choice in ('challenger','opponent')),
  watched              boolean not null default false,        -- watch-to-vote (server-confirmed in the cast RPC)
  encouragement_code   text,                                  -- OPTIONAL preset only; never free text (minor safety)
  created_at           timestamptz not null default now(),
  unique (duel_id, voter_competitor_id)                       -- one vote per duel per competitor
);

-- ---------- duel_ratings (separate Elo from tournament rating) ----------
create table if not exists duel_ratings (
  competitor_id  uuid primary key references competitors(id) on delete cascade,
  rating         integer not null default 1200,
  wins           integer not null default 0,
  losses         integer not null default 0,
  draws          integer not null default 0,
  streak         integer not null default 0,     -- current win streak
  best_streak    integer not null default 0,
  duels_fought   integer not null default 0,
  updated_at     timestamptz not null default now()
);

-- ---------- voter_stats (celebrate the judges) ----------
create table if not exists voter_stats (
  competitor_id  uuid primary key references competitors(id) on delete cascade,
  votes_cast     integer not null default 0,
  streak         integer not null default 0,     -- daily voting streak
  last_vote_date date,
  correct        integer not null default 0,      -- votes matching the certified winner
  qualified      integer not null default 0,      -- watched votes on certified duels (accuracy denominator)
  accuracy       numeric(5,4),                     -- correct::numeric / nullif(qualified,0)  (Sharp-Eye)
  updated_at     timestamptz not null default now()
);

-- ---------- duel_memberships (Phase 2 gate; table now, enforcement later) ----------
create table if not exists duel_memberships (
  id                     uuid primary key default gen_random_uuid(),
  competitor_id          uuid not null references competitors(id) on delete cascade,
  kind                   text not null default 'duelist' check (kind in ('duelist')),
  status                 text not null default 'inactive'
                           check (status in ('inactive','active','past_due','canceled')),
  current_period_end     timestamptz,
  stripe_subscription_id text,
  stripe_customer_id     text,   -- guardian is the billing account holder (COPPA)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (competitor_id, kind)
);

-- ---------- duel_reports (moderation — minor safety, Phase 1) ----------
-- A report auto-hides the duel (set duels.moderation_status='under_review') pending
-- staff review. The REPORTER is recorded (reporter_competitor_id) so false/abusive
-- reports are traceable and accountable.
create table if not exists duel_reports (
  id                    uuid primary key default gen_random_uuid(),
  duel_id               uuid not null references duels(id) on delete cascade,
  reporter_competitor_id uuid references competitors(id) on delete set null,  -- recorded for accountability
  target                text check (target in ('challenger','opponent','other')),
  reason                text not null,     -- preset reason code (no free text for minors)
  status                text not null default 'pending'
                          check (status in ('pending','upheld','dismissed')),
  resolved_by           uuid,              -- staff/admin auth_user_id
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
);

-- ---------- indexes ----------
create index if not exists duel_reports_duel_idx     on duel_reports(duel_id);
create index if not exists duel_reports_status_idx   on duel_reports(status) where status = 'pending';
create index if not exists duels_status_idx        on duels(status);
create index if not exists duels_challenger_idx     on duels(challenger_id);
create index if not exists duels_opponent_idx       on duels(opponent_id);
create index if not exists duels_closes_vote_idx    on duels(closes_vote_at) where status = 'voting';
create index if not exists duel_votes_duel_idx      on duel_votes(duel_id);
create index if not exists duel_votes_voter_idx     on duel_votes(voter_competitor_id);
create index if not exists duel_memberships_comp_idx on duel_memberships(competitor_id);

-- ---------- updated_at triggers (reuse existing set_updated_at()) ----------
drop trigger if exists duels_set_updated on duels;
create trigger duels_set_updated before update on duels
  for each row execute function set_updated_at();
drop trigger if exists duel_ratings_set_updated on duel_ratings;
create trigger duel_ratings_set_updated before update on duel_ratings
  for each row execute function set_updated_at();
drop trigger if exists voter_stats_set_updated on voter_stats;
create trigger voter_stats_set_updated before update on voter_stats
  for each row execute function set_updated_at();
drop trigger if exists duel_memberships_set_updated on duel_memberships;
create trigger duel_memberships_set_updated before update on duel_memberships
  for each row execute function set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table duels            enable row level security;
alter table duel_votes       enable row level security;
alter table duel_ratings     enable row level security;
alter table voter_stats      enable row level security;
alter table duel_memberships enable row level security;
alter table duel_reports     enable row level security;

grant select, insert on duels            to authenticated;
grant select, insert on duel_votes       to authenticated;
grant select          on duel_ratings    to authenticated;
grant select          on voter_stats     to authenticated;
grant select          on duel_memberships to authenticated;
grant select, insert on duel_reports     to authenticated;

-- ---------- duels: read the voting pool + your own; staff all ----------
-- (Mutations beyond the initial challenge go through SECURITY DEFINER RPCs in
--  the engine slice, so participants can't set their own winner/result.)
drop policy if exists duels_read on duels;
create policy duels_read on duels for select to authenticated
  using (
    nmao.is_staff()
    or challenger_id in (select nmao.competitor_ids())
    or opponent_id   in (select nmao.competitor_ids())
    -- community pool + watchable results, but only while not hidden by moderation
    or (status in ('live','voting','complete','no_contest') and moderation_status = 'ok')
  );

-- challenge: caller may only create a duel as one of their own competitors, in 'pending'
drop policy if exists duels_insert on duels;
create policy duels_insert on duels for insert to authenticated
  with check (
    challenger_id in (select nmao.competitor_ids())
    and status = 'pending'
    and winner_id is null
  );

-- ---------- duel_votes: open community voting ----------
-- DECISION (2026-08-13): OPEN VOTING. Everyone casts ONE vote per duel for
-- whoever they want — NO same-school exclusion, no participant exclusion.
-- Rationale (Brad): at scale one school can't move the result; early on votes
-- are capped/limited; more voters = more sponsor impressions; "if the president
-- can vote for himself, a school can vote for its competitors."
-- Integrity now rests on: one-vote-per-duel (unique constraint), watch-to-vote,
-- votes only while status='voting', hidden tally until near close, rate-limiting,
-- >=3 certify + majority (engine slice), and scale + vote caps.
--
-- A vote is accepted ONLY if:
--   • the voter is one of the caller's competitors (no voting as someone else)
--   • watched = true (watch-to-vote; server-confirmed in the cast RPC)
--   • the duel is currently in 'voting'
--   • unique(duel_id, voter) stops a single person double-voting
drop policy if exists duel_votes_insert on duel_votes;
create policy duel_votes_insert on duel_votes for insert to authenticated
  with check (
    voter_competitor_id in (select nmao.competitor_ids())
    and watched = true
    and exists (select 1 from duels d where d.id = duel_id and d.status = 'voting')
  );

-- read: only your own votes (running tally stays hidden until near close, exposed
--       via an aggregate RPC in the engine slice — never by reading rows). Staff all.
drop policy if exists duel_votes_read on duel_votes;
create policy duel_votes_read on duel_votes for select to authenticated
  using (nmao.is_staff() or voter_competitor_id in (select nmao.competitor_ids()));
-- (no update/delete policy: votes are immutable)

-- ---------- ratings & voter stats: public leaderboards (read-only to users) ----------
drop policy if exists duel_ratings_read on duel_ratings;
create policy duel_ratings_read on duel_ratings for select to authenticated using (true);
drop policy if exists voter_stats_read on voter_stats;
create policy voter_stats_read on voter_stats for select to authenticated using (true);
-- (writes happen via SECURITY DEFINER RPCs / the Stripe webhook using the service role)

-- ---------- memberships: read your own; staff all ----------
drop policy if exists duel_memberships_read on duel_memberships;
create policy duel_memberships_read on duel_memberships for select to authenticated
  using (nmao.is_staff() or competitor_id in (select nmao.competitor_ids()));

-- ---------- duel_reports: file a report; read your own; staff all ----------
-- Anyone can report a duel they can see; the reporter is recorded for accountability
-- (false-report tracking). Auto-hiding the duel + resolution happen via the moderation
-- RPC (engine slice) running with the service role.
drop policy if exists duel_reports_insert on duel_reports;
create policy duel_reports_insert on duel_reports for insert to authenticated
  with check (reporter_competitor_id in (select nmao.competitor_ids()));
drop policy if exists duel_reports_read on duel_reports;
create policy duel_reports_read on duel_reports for select to authenticated
  using (nmao.is_staff() or reporter_competitor_id in (select nmao.competitor_ids()));
