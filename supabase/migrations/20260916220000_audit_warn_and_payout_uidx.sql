-- Two small pre-submission hardening items from the 5-agent sweep.

-- L1: the VPC audit trigger swallowed ALL errors silently (when others then null),
-- so a failed consent write left a paid entry with no audit record and NO signal.
-- Keep it non-blocking (settlement must never fail on the audit), but RAISE WARNING
-- so audit-write failures are visible in the logs.
create or replace function nmao.record_vpc_on_paid_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_guardian uuid;
begin
  if new.payment_status = 'paid'
     and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') then
    begin
      select guardian_id into v_guardian
      from public.guardian_competitors
      where competitor_id = new.competitor_id
      limit 1;

      insert into public.consents (competitor_id, guardian_id, type, method, reference, agreed_at)
      values (new.competitor_id, v_guardian, 'coppa_vpc_payment', 'monetary_transaction',
              coalesce(new.payment_intent_id, new.entitlement_id::text), now())
      on conflict (competitor_id) where type = 'coppa_vpc_payment' do nothing;
    exception when others then
      -- audit-only: never block settlement, but make the gap visible
      raise warning 'record_vpc_on_paid_entry: VPC consent write failed for competitor % : %', new.competitor_id, sqlerrm;
    end;
  end if;
  return new;
end $$;

-- M1: the entitlement/invoice school-payout path did read-then-insert with no
-- unique constraint, so two concurrent webhook deliveries could create TWO rows
-- for the same (payment_intent_id, entry_id IS NULL) — then every later .maybeSingle()
-- threw on 2 rows and the school's share got stuck 'pending' forever. This partial
-- unique index makes the duplicate insert a clean no-op (the entry path already had
-- its own unique index on entry_id). No dup rows exist today (verified).
create unique index if not exists uq_school_payouts_pi_no_entry
  on public.school_payouts (payment_intent_id)
  where entry_id is null and payment_intent_id is not null;
