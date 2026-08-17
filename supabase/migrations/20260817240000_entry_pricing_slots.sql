-- ============================================================
-- Tournament entry pricing — slot-based, 3 lanes (à la carte / monthly / season).
-- Replaces the old flat per-event fee (app_settings.entry_fee_cents). A competitor
-- buys event SLOTS (1 or 2) per round; they pick WHICH events each round. Payment
-- grants slots (round_slots); the entries table still records the specific events.
--   • à la carte  → one-time payment per round → round_slots(source='alacarte')
--   • monthly     → Stripe subscription        → entry_passes + round_slots/active month
--   • season      → one-time (pay in full)      → entry_passes + round_slots/round
-- Phase 1 wires à la carte; entry_passes lands with monthly/season.
-- ============================================================

-- ---- Pricing config (data-driven; tune without a deploy) ----
create table if not exists tournament_pricing (
  lane          text not null check (lane in ('alacarte','monthly','season')),
  event_slots   int  not null check (event_slots between 1 and 2),
  amount_cents  int  not null check (amount_cents >= 0),
  stripe_price_id text,                 -- recurring Price (monthly) / optional one-time Price
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (lane, event_slots)
);

insert into tournament_pricing (lane, event_slots, amount_cents) values
  ('alacarte', 1,  5500), ('alacarte', 2,  9900),
  ('monthly',  1,  4500), ('monthly',  2,  8500),
  ('season',   1, 35000), ('season',   2, 65000)
on conflict (lane, event_slots) do nothing;

alter table tournament_pricing enable row level security;
grant select on tournament_pricing to anon, authenticated;
drop policy if exists pricing_read on tournament_pricing;
create policy pricing_read on tournament_pricing for select to anon, authenticated using (active);

-- ---- Standing entitlements (monthly sub / season pass) ----
create table if not exists entry_passes (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  season_id     uuid not null references seasons(id),
  lane          text not null check (lane in ('monthly','season')),
  event_slots   int  not null check (event_slots between 1 and 2),
  status        text not null default 'incomplete' check (status in ('incomplete','active','past_due','canceled')),
  stripe_customer_id      text,
  stripe_subscription_id  text,          -- monthly
  stripe_payment_intent_id text,         -- season (one-time)
  current_period_end      timestamptz,   -- monthly
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (competitor_id, season_id)      -- one standing pass per competitor per season
);
create index if not exists entry_passes_comp on entry_passes(competitor_id);

-- ---- Per-round slot grant (from à la carte OR a standing pass) ----
create table if not exists round_slots (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  round_id      uuid not null references rounds(id) on delete cascade,
  slots         int  not null check (slots between 1 and 2),
  source        text not null check (source in ('alacarte','monthly','season','comp')),
  pass_id       uuid references entry_passes(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','paid','void')),
  stripe_payment_intent_id text,         -- à la carte one-time
  amount_cents  int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (competitor_id, round_id)       -- one slot grant per competitor per round
);
create index if not exists round_slots_round on round_slots(round_id);

-- RLS: a competitor / their guardian reads their own passes + slots; staff read all.
-- Writes happen only through service-role EFs (purchase + webhook), so no write policy.
alter table entry_passes enable row level security;
alter table round_slots  enable row level security;
grant select on entry_passes, round_slots to authenticated;

drop policy if exists passes_read on entry_passes;
create policy passes_read on entry_passes for select to authenticated
  using (nmao.is_staff() or competitor_id in (select nmao.competitor_ids()));

drop policy if exists slots_read on round_slots;
create policy slots_read on round_slots for select to authenticated
  using (nmao.is_staff() or competitor_id in (select nmao.competitor_ids()));

-- Helper: paid event-slots a competitor holds for a round (0 if none).
create or replace function public.round_slots_for(p_competitor uuid, p_round uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select slots from round_slots
                   where competitor_id = p_competitor and round_id = p_round and status = 'paid'), 0);
$$;
grant execute on function public.round_slots_for(uuid, uuid) to authenticated, service_role;
