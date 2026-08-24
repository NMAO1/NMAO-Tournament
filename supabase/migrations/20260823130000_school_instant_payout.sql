-- =====================================================================
-- School INSTANT payout: on each paid entry, the school's share is transferred
-- to its Stripe connected account immediately (via the webhook), instead of the
-- old batch/monthly accrual. Judges stay on the manual pay-judges flow.
-- Share % is config-driven (flat 30% now; may be tiered later).
-- =====================================================================

-- Config: school's share of each entry fee (0..1). Tunable / tierable later.
insert into public.app_settings (key, value)
values ('school_share_pct', to_jsonb(0.30))
on conflict (key) do update set value = excluded.value;

-- school_payouts was period/batch-oriented; add per-entry columns so each paid
-- entry gets exactly one payout record (idempotent), plus a Stripe transfer id.
alter table public.school_payouts
  add column if not exists entry_id          uuid references entries(id) on delete set null,
  add column if not exists competitor_id     uuid references competitors(id) on delete set null,
  add column if not exists payment_intent_id text;

-- At most one payout row per entry (NULLs stay distinct -> legacy/batch rows unaffected).
create unique index if not exists school_payouts_entry_uidx on public.school_payouts(entry_id);
create index        if not exists school_payouts_pi_idx     on public.school_payouts(payment_intent_id);

-- Allow a 'reversed' status for refunded entries (transfer reversed).
alter table public.school_payouts drop constraint if exists school_payouts_status_check;
alter table public.school_payouts add constraint school_payouts_status_check
  check (status in ('pending','paid','failed','reversed'));

comment on table public.school_payouts is
  'One row per paid entry: the school''s instant revenue share. status: paid (transfer sent), pending (accrued — no connected account or transfer failed), reversed (entry refunded), failed.';
