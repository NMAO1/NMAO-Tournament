-- =====================================================================
-- Fix claim_round_entry same-event double-spend (TOCTOU).
-- Before: the "already entered" check ran BEFORE the entitlement lock, and the
-- credit was ALWAYS decremented. Two concurrent claims of the SAME event (a
-- double-tap) both passed the pre-lock check; the second one's upsert hit the
-- unique conflict, DO-UPDATEd the already-paid entry, and still spent a second
-- credit → 1 entry, 2 credits gone.
-- After: the ON CONFLICT DO UPDATE only fires when the entry is not already
-- paid, and the credit is spent ONLY when this call actually flipped the entry
-- unpaid→paid (a row came back). The entries unique index serializes concurrent
-- same-event claims at the row level, so the spend is now exactly-once even if
-- the two claims lock different buckets.
-- =====================================================================
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

  -- fast path: already entered this event? (final correctness is the conditional
  -- upsert below — this is just an early return)
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

  -- create/flip the entry to PAID — but ONLY if it isn't already paid. The unique
  -- index (round_id,competitor_id,event) serializes concurrent same-event claims,
  -- so exactly one call gets a returned row.
  insert into entries (round_id, competitor_id, event, age_bracket, declared_rank, rating_at_entry,
                       status, payment_status, paid_at, entitlement_id, updated_at)
  values (v_round_id, p_competitor_id, p_event, v_bracket, v_rank, v_rating,
          'submitted', 'paid', now(), ent.id, now())
  on conflict (round_id, competitor_id, event) do update set
    payment_status = 'paid', paid_at = now(), entitlement_id = ent.id, updated_at = now()
    where entries.payment_status is distinct from 'paid'
  returning id into v_entry_id;

  -- nothing returned = a concurrent claim already paid this event; do NOT spend a
  -- second credit
  if v_entry_id is null then
    select id into v_entry_id from entries
      where round_id = v_round_id and competitor_id = p_competitor_id and event = p_event;
    return jsonb_build_object('claimed', false, 'reason', 'already_entered', 'entry_id', v_entry_id);
  end if;

  -- spend the credit (only when THIS call flipped the entry unpaid→paid)
  update entry_entitlements set credits_used = credits_used + 1, updated_at = now() where id = ent.id;

  return jsonb_build_object('claimed', true, 'reason', 'claimed', 'entry_id', v_entry_id,
                            'credits_remaining', ent.credits_total - ent.credits_used - 1);
end;
$$;
revoke all on function public.claim_round_entry(uuid, text) from public, anon;
grant execute on function public.claim_round_entry(uuid, text) to authenticated;
