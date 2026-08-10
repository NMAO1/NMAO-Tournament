-- =====================================================================
-- Entry payments: an entry is only a LIVE entry once paid. Registration creates
-- it 'unpaid'; the competitor/guardian pays (in-app), a webhook flips it 'paid'.
-- Unpaid entries don't compete and can expire.
-- =====================================================================
alter table entries add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'paid', 'waived', 'expired'));
alter table entries add column if not exists payment_intent_id text;
alter table entries add column if not exists paid_at timestamptz;
alter table entries add column if not exists pay_expires_at timestamptz;

create index if not exists idx_entries_payment_status on entries(payment_status);
