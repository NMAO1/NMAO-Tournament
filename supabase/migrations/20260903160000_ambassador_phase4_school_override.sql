-- =====================================================================
-- AMBASSADOR PROGRAM — Phase 4: school override (10% of collected platform fee)
-- Monthly, per attributed school. Amount = 10% of the fee NMAO actually collected
-- from that school that month (Membership platform_fee_usage.accrued_fee_cents,
-- read cross-project). FLAG-GATED OFF by default — flip on when launch-timing is right.
-- =====================================================================
create table if not exists public.partner_school_payouts (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null references public.partners(id) on delete restrict,
  member_school_id    uuid not null,                 -- Membership (ykioz) school id
  period              text not null,                 -- 'YYYY-MM'
  collected_fee_cents integer not null default 0,    -- fee NMAO collected that month (post-refund, capped)
  rate                numeric not null default 0.10, -- 10%
  amount_cents        integer not null default 0,    -- round(collected_fee_cents * rate)
  status              text not null default 'pending' check (status in ('pending','paid','reversed')),
  stripe_transfer_id  text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  unique (partner_id, member_school_id, period)      -- one row per school per month
);
create index if not exists partner_school_payouts_status on public.partner_school_payouts (status);
alter table public.partner_school_payouts enable row level security;

-- Launch-timing flag (OFF). Flip to true in app_settings to enable accrual.
insert into public.app_settings (key, value)
values ('partner_school_override_enabled', 'false'::jsonb)
on conflict (key) do nothing;
