-- =====================================================================
-- AMBASSADOR PROGRAM — Phase 1 (Tournament / Mission Control)
-- Partner registry + school attribution. Canonical home = Tournament (oxzua),
-- managed from Mission Control (beside the judge-payout path). Attribution is
-- keyed on the MEMBERSHIP school id (the universal unit) so an ambassador earns
-- even on a membership-only school that never enters the tournament.
-- Payout tables (partner_event_payouts, partner_school_payouts) come in later phases.
-- Idempotent — safe to re-run.
-- =====================================================================

-- Ambassadors ---------------------------------------------------------------
create table if not exists public.partners (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  email                     text,
  slug                      text not null unique,          -- the ?p=<slug> referral code
  stripe_connect_account_id text,                          -- set in the onboarding phase
  payouts_enabled           boolean not null default false,-- mirrors the judges.payouts_enabled gate
  tier                      text not null default 'ambassador'
                              check (tier in ('ambassador','regional_director','founding')),
  status                    text not null default 'active'
                              check (status in ('active','paused','disabled')),
  created_at                timestamptz not null default now()
);

-- School -> partner attribution (ONE active row per membership school = first-touch lock)
create table if not exists public.partner_school_attributions (
  id                   uuid primary key default gen_random_uuid(),
  partner_id           uuid not null references public.partners(id) on delete restrict,
  member_school_id     uuid not null,                          -- Membership (ykioz) school id
  tournament_school_id uuid references public.schools(id),     -- set if/when the school is bridged in
  school_name          text,                                   -- convenience label for the admin UI
  method               text not null default 'manual' check (method in ('code','manual','import')),
  attributed_at        timestamptz not null default now(),
  active               boolean not null default true,
  ended_at             timestamptz,
  note                 text
);
-- THE LOCK: at most one ACTIVE attribution per membership school.
create unique index if not exists partner_school_attr_one_active
  on public.partner_school_attributions (member_school_id) where active;
create index if not exists partner_school_attr_partner
  on public.partner_school_attributions (partner_id);

-- Audit trail for every attribution change ----------------------------------
create table if not exists public.partner_attribution_audit (
  id               uuid primary key default gen_random_uuid(),
  member_school_id uuid,
  partner_id       uuid,
  prev_partner_id  uuid,
  action           text not null,        -- 'attribute' | 'reassign' | 'end'
  method           text,                 -- 'code' | 'manual' | 'import'
  actor            text,                 -- staff auth_user_id / 'system:resolve-referral'
  reason           text,
  created_at       timestamptz not null default now()
);

-- RLS: locked. Edge Functions use the service role (bypass); Mission Control
-- reaches these only through staff-gated EFs, same as the judge-payout path.
alter table public.partners                    enable row level security;
alter table public.partner_school_attributions enable row level security;
alter table public.partner_attribution_audit   enable row level security;
