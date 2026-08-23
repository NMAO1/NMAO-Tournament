-- =====================================================================
-- Two hardening items from the round-2 re-audit.
--
-- (1) DEFENSE-IN-DEPTH: revoke default table-level write grants on entries and
--     entry_entitlements from anon/authenticated. They are inert today (RLS has
--     no permissive write policy) but "load-bearing on that fact" — revoking
--     ensures a future narrowly-scoped policy can't silently widen exposure.
--     Service role + SECURITY DEFINER functions (owner postgres) are unaffected,
--     so the real write paths (EFs, claim_round_entry) keep working.
--
-- (2) MONTHLY-CREDIT LEDGER: add_subscription_credits deduped only on the single
--     last_credit_invoice_id, so a Stripe resend of a PRIOR invoice granted a
--     free credit. Replace with a per-invoice ledger keyed on invoice_id so each
--     invoice credits exactly once, ever.
-- =====================================================================

-- (1) revoke inert write grants
revoke insert, update, delete on public.entries            from anon, authenticated;
revoke insert, update, delete on public.entry_entitlements from anon, authenticated;

-- (2) per-invoice credit ledger
create table if not exists credit_invoice_ledger (
  invoice_id      text primary key,
  subscription_id text not null,
  credited_at     timestamptz not null default now()
);
alter table credit_invoice_ledger enable row level security;  -- service-role only; no policies

create or replace function public.add_subscription_credits(p_subscription_id text, p_n integer, p_invoice_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_invoice_id is not null then
    -- Ledger claims the invoice exactly once. If it was already credited (any
    -- prior invoice, in any order), the insert conflicts and we stop — no credit.
    insert into credit_invoice_ledger (invoice_id, subscription_id)
      values (p_invoice_id, p_subscription_id)
      on conflict (invoice_id) do nothing;
    if not found then return; end if;
  end if;
  update entry_entitlements
     set credits_total = credits_total + greatest(0, coalesce(p_n, 0)),
         last_credit_invoice_id = coalesce(p_invoice_id, last_credit_invoice_id),
         updated_at = now()
   where stripe_subscription_id = p_subscription_id
     and status <> 'canceled';
end;
$$;
revoke all on function public.add_subscription_credits(text, integer, text) from public, authenticated, anon;
