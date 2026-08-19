-- ============================================================
--  Phase 2 billing helpers — self-serve sponsor signup + Stripe subscriptions.
--    grant_tier_entitlements  — webhook grants a paid sponsor its tier's offerings
--    admin_set_tier_pricing   — staff set a tier's monthly price + Stripe price id
--    public_sponsor_tiers     — the signup page lists plans (name, price, offerings)
-- ============================================================

-- Called by the Stripe webhook (service role) once a subscription is paid.
create or replace function public.grant_tier_entitlements(p_sponsor uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_tier uuid;
begin
  select tier_id into v_tier from public.sponsors where id = p_sponsor;
  if v_tier is null then return; end if;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  select p_sponsor, t.offering_code, 'tier', true from public.tier_offerings t where t.tier_id = v_tier
  on conflict (sponsor_id, offering_code) do update set active = true, source = 'tier';
end $$;
grant execute on function public.grant_tier_entitlements(uuid) to service_role;

-- Staff set a tier's price + Stripe recurring price id (from the Stripe dashboard).
create or replace function public.admin_set_tier_pricing(p_tier uuid, p_price_cents int, p_stripe_price_id text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  update public.sponsor_tiers set
    monthly_price_cents = coalesce(p_price_cents, monthly_price_cents),
    stripe_price_id = coalesce(nullif(p_stripe_price_id, ''), stripe_price_id)
  where id = p_tier;
end $$;
grant execute on function public.admin_set_tier_pricing(uuid, int, text) to authenticated;

-- Public plan list for the signup page (name, price, and what each tier includes).
create or replace function public.public_sponsor_tiers()
returns table (id uuid, name text, code text, monthly_price_cents int, product_slots int, purchasable boolean, offerings text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.code, t.monthly_price_cents, t.product_slots,
    (coalesce(t.stripe_price_id,'') <> ''),
    array(select o.name from public.tier_offerings x join public.sponsor_offerings o on o.code = x.offering_code
          where x.tier_id = t.id order by o.sort_order)
  from public.sponsor_tiers t where t.active order by t.sort_order;
$$;
grant execute on function public.public_sponsor_tiers() to anon, authenticated;
