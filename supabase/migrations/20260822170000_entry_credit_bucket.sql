-- =====================================================================
-- Season pass = a BUCKET OF CREDITS (fixes the season-pass double-charge).
--
-- Model: an entitlement carries credits_total / credits_used. Entering ANY
-- event in ANY round spends 1 credit (no per-round cap) and creates a PAID
-- entry — no Stripe charge. Buckets:
--   full     = 9 credits (a season)           alacarte = 1 credit
--   monthly  = 0 at purchase, +1 per paid invoice (rolling over)
--   topup    = N credits at the pass per-entry rate (bought when empty)
-- Credits are season-scoped (an entitlement covers rounds of its own season),
-- so unused credits expire at season end.
--
-- This makes credits the single source of truth: entries become paid ONLY via
-- claim_round_entry (which decrements) or a real charge. Purchase-time entry
-- STAGING is removed from create-entitlement-checkout in the same change.
-- =====================================================================

-- ---- schema --------------------------------------------------------
alter table entry_entitlements
  add column if not exists credits_total integer not null default 0,
  add column if not exists credits_used  integer not null default 0,
  add column if not exists last_credit_invoice_id text;  -- idempotency for monthly refills

-- backfill existing rows (test data): grant per lane, count already-paid uses
update entry_entitlements e set
  credits_total = case e.lane
                    when 'full'    then 9
                    when 'alacarte' then greatest(1, (select count(*) from entries en where en.entitlement_id = e.id and en.payment_status = 'paid'))
                    else (select count(*) from entries en where en.entitlement_id = e.id and en.payment_status = 'paid') -- monthly: credits arrive via invoices
                  end,
  credits_used  = coalesce((select count(*) from entries en where en.entitlement_id = e.id and en.payment_status = 'paid'), 0)
where e.credits_total = 0 and e.credits_used = 0;

-- ---- config --------------------------------------------------------
insert into app_settings (key, value) values
  ('season_pass_credits',   to_jsonb(9)),   -- a full-season bucket = 9 entries
  ('monthly_credit_refill', to_jsonb(1))    -- credits added per paid monthly invoice
on conflict (key) do nothing;

-- ---- monthly renewal: add credits to the subscription's bucket ------
drop function if exists public.add_subscription_credits(text, integer);
create or replace function public.add_subscription_credits(p_subscription_id text, p_n integer, p_invoice_id text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update entry_entitlements
     set credits_total = credits_total + greatest(0, coalesce(p_n, 0)),
         last_credit_invoice_id = coalesce(p_invoice_id, last_credit_invoice_id),
         updated_at = now()
   where stripe_subscription_id = p_subscription_id
     and status <> 'canceled'
     -- idempotent: never re-credit the same invoice on a webhook re-delivery
     and (p_invoice_id is null or last_credit_invoice_id is distinct from p_invoice_id);
$$;
revoke all on function public.add_subscription_credits(text, integer, text) from public, authenticated, anon;

-- ---- credit summary for the app (ownership-scoped) -----------------
create or replace function public.competitor_credit_summary(p_competitor_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_season uuid;
  v_remaining integer;
begin
  if p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;
  select season_id into v_season
    from rounds where state in ('open','collecting') and coalesce(seq, 0) < 900
    order by coalesce(opens_at, created_at) desc nulls last limit 1;
  select coalesce(sum(credits_total - credits_used), 0) into v_remaining
    from entry_entitlements
    where competitor_id = p_competitor_id
      and status = 'active'
      and credits_used < credits_total
      and (v_season is null or season_id = v_season or season_id is null);
  return jsonb_build_object('credits_remaining', v_remaining, 'has_credits', v_remaining > 0);
end;
$$;
revoke all on function public.competitor_credit_summary(uuid) from public;
grant execute on function public.competitor_credit_summary(uuid) to authenticated;

-- ---- the claim: spend 1 credit -> paid entry (no charge) -----------
-- Ownership enforced for user (JWT) callers; trusted for service-role callers
-- (create-entry-checkout, which has already checked ownership).
-- Returns jsonb: { claimed, reason, entry_id, credits_remaining }.
create or replace function public.claim_round_entry(p_competitor_id uuid, p_event text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_round_id uuid;
  v_seq integer;
  v_season uuid;
  v_dob date;
  v_rank_raw text;
  v_rank text;
  v_age integer;
  v_bracket text;
  v_rating numeric;
  ent entry_entitlements%rowtype;
  v_existing_id uuid;
  v_existing_pay text;
  v_entry_id uuid;
begin
  -- auth: real users must own the competitor; service role (auth.uid() null) is trusted
  if auth.uid() is not null and p_competitor_id not in (select nmao.competitor_ids()) then
    raise exception 'not authorized as this competitor' using errcode = '42501';
  end if;

  if not exists (select 1 from event_types where code = p_event) then
    return jsonb_build_object('claimed', false, 'reason', 'unknown_event');
  end if;

  select id, seq, season_id into v_round_id, v_seq, v_season
    from rounds where state in ('open','collecting') and coalesce(seq, 0) < 900
    order by coalesce(opens_at, created_at) desc nulls last limit 1;
  if v_round_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'no_open_round');
  end if;

  -- already entered this event? never double-spend a credit
  select id, payment_status into v_existing_id, v_existing_pay
    from entries where round_id = v_round_id and competitor_id = p_competitor_id and event = p_event;
  if v_existing_id is not null and v_existing_pay = 'paid' then
    return jsonb_build_object('claimed', false, 'reason', 'already_entered', 'entry_id', v_existing_id);
  end if;

  -- pick an active, in-season entitlement that still has credits; lock it so two
  -- concurrent claims can't overspend the bucket
  select * into ent from entry_entitlements e
    where e.competitor_id = p_competitor_id
      and e.status = 'active'
      and e.credits_used < e.credits_total
      and (v_season is null or e.season_id = v_season or e.season_id is null)
    order by (case when e.round_id = v_round_id then 0 else 1 end), e.created_at asc
    for update
    limit 1;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'no_credits');
  end if;

  -- competitor must have a rank + dob (division needs them)
  select dob, declared_rank into v_dob, v_rank_raw from competitors where id = p_competitor_id;
  if v_rank_raw is null then return jsonb_build_object('claimed', false, 'reason', 'no_rank'); end if;
  if v_dob is null then return jsonb_build_object('claimed', false, 'reason', 'no_dob'); end if;
  v_rank := case when v_rank_raw in ('beginner','intermediate','advanced') then v_rank_raw
                 when v_rank_raw = 'black_belt' then 'advanced'
                 else v_rank_raw end;
  v_age := date_part('year', age(current_date, v_dob));
  select code into v_bracket from age_brackets
    where v_age >= min_age and (max_age is null or v_age <= max_age)
    order by min_age desc limit 1;
  if v_bracket is null then return jsonb_build_object('claimed', false, 'reason', 'no_age_bracket'); end if;
  v_rating := coalesce((select rating from skill_ratings where competitor_id = p_competitor_id), 50);

  -- create/flip the entry to PAID against this entitlement
  insert into entries (round_id, competitor_id, event, age_bracket, declared_rank, rating_at_entry,
                       status, payment_status, paid_at, entitlement_id, updated_at)
  values (v_round_id, p_competitor_id, p_event, v_bracket, v_rank, v_rating,
          'submitted', 'paid', now(), ent.id, now())
  on conflict (round_id, competitor_id, event) do update set
    payment_status = 'paid', paid_at = now(), entitlement_id = ent.id, updated_at = now()
  returning id into v_entry_id;

  -- spend the credit
  update entry_entitlements set credits_used = credits_used + 1, updated_at = now() where id = ent.id;

  return jsonb_build_object('claimed', true, 'reason', 'claimed', 'entry_id', v_entry_id,
                            'credits_remaining', ent.credits_total - ent.credits_used - 1);
end;
$$;
revoke all on function public.claim_round_entry(uuid, text) from public, anon;
grant execute on function public.claim_round_entry(uuid, text) to authenticated;
