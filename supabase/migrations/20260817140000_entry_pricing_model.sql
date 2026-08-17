-- =====================================================================
--  Tournament entry pricing — slot-based, 3-lane model (replaces the old
--  flat entry_fee_cents). Competitors buy the RIGHT to enter 1–2 events per
--  round via one of three lanes; a per-round registration (entries) draws on
--  that entitlement. See memory tournament-pricing-model.
--    à la carte  : 1ev $55  / 2ev $99   — one-time, per round
--    monthly sub : 1ev $45  / 2ev $85   — recurring, active tournament months
--    pay-in-full : 1ev $350 / 2ev $650  — one-time, whole season (prorates late)
-- =====================================================================

-- The price catalog — one row per (lane, event_slots). Stripe IDs filled by
-- the setup-pricing EF. Public-readable so the app can render the plan screen.
create table if not exists public.pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  lane text not null check (lane in ('alacarte', 'monthly', 'full')),
  event_slots int not null check (event_slots between 1 and 4),
  unit_amount_cents int not null,
  bill_interval text check (bill_interval in ('month')),   -- null except monthly
  stripe_product_id text,
  stripe_price_id text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (lane, event_slots)
);

-- Seed the amounts now (Stripe IDs added later by setup-pricing). Cap at 2 for
-- launch; the table supports 3/4 later without a rewrite.
insert into public.pricing_tiers (lane, event_slots, unit_amount_cents, bill_interval) values
  ('alacarte', 1, 5500,  null),
  ('alacarte', 2, 9900,  null),
  ('monthly',  1, 4500,  'month'),
  ('monthly',  2, 8500,  'month'),
  ('full',     1, 35000, null),
  ('full',     2, 65000, null)
on conflict (lane, event_slots) do update set unit_amount_cents = excluded.unit_amount_cents, bill_interval = excluded.bill_interval;

-- A purchased right to enter N events per round. à la carte scopes to one round;
-- monthly/full are season-wide. entries reference the entitlement that covers them.
create table if not exists public.entry_entitlements (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  season_id uuid references public.seasons(id),
  lane text not null check (lane in ('alacarte', 'monthly', 'full')),
  event_slots int not null check (event_slots between 1 and 4),
  round_id uuid references public.rounds(id),          -- set for à la carte (that round only); null = season-wide
  status text not null default 'incomplete' check (status in ('incomplete', 'active', 'past_due', 'canceled')),
  valid_from_round int,                                 -- round_no a full/monthly pass starts at (late-join proration)
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_at timestamptz
);
create index if not exists entry_entitlements_comp_idx on public.entry_entitlements (competitor_id, status);
create unique index if not exists entry_entitlements_sub_idx on public.entry_entitlements (stripe_subscription_id) where stripe_subscription_id is not null;

-- Which entitlement paid for a given per-round entry (null = legacy per-entry PI).
alter table public.entries add column if not exists entitlement_id uuid references public.entry_entitlements(id);

-- ---- RLS ----
alter table public.pricing_tiers enable row level security;
drop policy if exists pricing_tiers_read on public.pricing_tiers;
create policy pricing_tiers_read on public.pricing_tiers for select using (true);

alter table public.entry_entitlements enable row level security;
-- Competitor or their guardian can see their own entitlements; writes are service-role (EFs) only.
drop policy if exists entitlements_owner_read on public.entry_entitlements;
create policy entitlements_owner_read on public.entry_entitlements for select using (
  competitor_id in (select id from public.competitors where auth_user_id = auth.uid())
  or competitor_id in (
    select gc.competitor_id from public.guardian_competitors gc
    join public.guardians g on g.id = gc.guardian_id
    where g.auth_user_id = auth.uid()
  )
);
