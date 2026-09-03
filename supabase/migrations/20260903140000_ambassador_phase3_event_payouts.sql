-- =====================================================================
-- AMBASSADOR PROGRAM — Phase 3: competitor override ($1 per paid entry)
-- One payout row per paid entry (idempotent on entry_id). Accrued by
-- accrue-partner-payouts (pure DB), paid by pay-partners (Stripe transfers).
-- =====================================================================
create table if not exists public.partner_event_payouts (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null references public.partners(id) on delete restrict,
  entry_id          uuid not null unique,          -- one $1 per paid entry (idempotent)
  competitor_id     uuid,
  member_school_id  uuid,
  round_id          uuid,
  event             text,
  amount_cents      integer not null default 100,  -- $1.00
  currency          text not null default 'usd',
  status            text not null default 'pending' check (status in ('pending','paid','reversed')),
  stripe_transfer_id text,
  paid_at           timestamptz,
  reversed_at       timestamptz,
  reversal_reason   text,
  created_at        timestamptz not null default now()
);
create index if not exists partner_event_payouts_partner_status on public.partner_event_payouts (partner_id, status);
create index if not exists partner_event_payouts_status on public.partner_event_payouts (status);
alter table public.partner_event_payouts enable row level security;
