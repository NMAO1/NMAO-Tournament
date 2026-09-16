-- COPPA verifiable-parental-consent (VPC) audit trail — monetary-transaction
-- method, 16 CFR §312.5(b)(2)(B). Registration records a consent CHECKBOX; this
-- adds the auditable proof that a *guardian card payment* was completed for a
-- given child, tied to the Stripe reference. When any of a competitor's entries
-- first settles to 'paid', we write a `coppa_vpc_payment` consent row. One record
-- per competitor; best-effort so it can never block payment settlement.
--
-- NOTE (product/legal): this records the VPC *when the entry payment settles*,
-- which currently happens at first entry — AFTER the child profile is collected at
-- registration. It gives an audit trail for the payment-based VPC; it does not by
-- itself move the payment gate ahead of profile collection (see AUTH/onboarding
-- discussion). Sufficiency of timing is a question for counsel.

-- 1) consents: carry the verification method + the payment reference, and allow
--    the new VPC type.
alter table public.consents
  add column if not exists method    text,
  add column if not exists reference text;

alter table public.consents drop constraint if exists consents_type_check;
alter table public.consents add constraint consents_type_check
  check (type = any (array[
    'coppa_media','participation_waiver','media_release','rules','terms','coppa_vpc_payment'
  ]));

-- One VPC record per competitor (idempotency for both the trigger and backfill).
create unique index if not exists uq_consents_vpc_per_competitor
  on public.consents (competitor_id) where type = 'coppa_vpc_payment';

-- 2) Record the VPC the first time any of a competitor's entries becomes paid.
--    Fires for EVERY path that flips an entry to paid (Stripe webhook,
--    register-entry, inhouse, admin). The insert is wrapped so a failure here can
--    never abort the payment settlement that triggered it.
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
      null; -- audit-only: never block settlement
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_record_vpc_on_paid_entry on public.entries;
create trigger trg_record_vpc_on_paid_entry
  after insert or update of payment_status on public.entries
  for each row execute function nmao.record_vpc_on_paid_entry();

-- 3) Backfill competitors who already have a paid entry, referencing their
--    earliest paid entry's payment reference.
insert into public.consents (competitor_id, guardian_id, type, method, reference, agreed_at)
select distinct on (e.competitor_id)
       e.competitor_id,
       (select guardian_id from public.guardian_competitors gc where gc.competitor_id = e.competitor_id limit 1),
       'coppa_vpc_payment', 'monetary_transaction',
       coalesce(e.payment_intent_id, e.entitlement_id::text),
       coalesce(e.paid_at, now())
from public.entries e
where e.payment_status = 'paid'
order by e.competitor_id, e.paid_at nulls last
on conflict (competitor_id) where type = 'coppa_vpc_payment' do nothing;
