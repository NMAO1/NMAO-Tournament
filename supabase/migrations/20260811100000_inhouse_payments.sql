-- =====================================================================
-- In-house tournament PAYMENTS (hybrid: school pre-adds entrants + parents
-- self-register and pay). Money moves as a Stripe DIRECT CHARGE on the
-- school's connected account with an application_fee_amount = the platform's
-- cut, so the school bears its own liability (consistent with Standard
-- Connect accounts) and NMAO skims a % off the top.
-- =====================================================================

alter table in_house_tournaments
  add column if not exists entry_fee_cents   int,                                        -- null / 0 = free event
  add column if not exists platform_fee_bps  int  not null default 500,                  -- NMAO cut in basis points (500 = 5%)
  add column if not exists registration_open boolean not null default true,              -- accept self-registrations?
  add column if not exists public_token      text not null default replace(gen_random_uuid()::text, '-', '');

create unique index if not exists idx_iht_public_token on in_house_tournaments(public_token);

alter table ih_entrants
  add column if not exists payment_status     text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'waived')),
  add column if not exists checkout_session_id text,
  add column if not exists paid_at             timestamptz,
  add column if not exists payer_email         text,
  add column if not exists self_registered     boolean not null default false;

-- Existing owner RLS (iht_owner_all / ihe_owner_all) already covers the new
-- columns. Public self-registration and the payment webhook run through edge
-- functions on the service role, so no anon RLS is opened here.
