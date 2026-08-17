-- Judge onboarding state: payout readiness (from Stripe Connect Express) + FCRA
-- background-check consent timestamp. A judge becomes status='active' only once
-- bg cleared + IC agreement + creed + payouts_enabled are all satisfied.
alter table public.judges
  add column if not exists payouts_enabled boolean not null default false,
  add column if not exists bg_consent_at timestamptz;
