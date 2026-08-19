-- Dynamic pricing: a tier is purchasable once it has a monthly PRICE (set in
-- Mission Control) — no pre-made Stripe price_id required. The signup checkout
-- builds the Stripe price inline from the dollar amount (like a retail POS).
-- A stripe_price_id, if set, still wins as an override.
create or replace function public.public_sponsor_tiers()
returns table (id uuid, name text, code text, monthly_price_cents int, product_slots int, purchasable boolean, offerings text[])
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.code, t.monthly_price_cents, t.product_slots,
    (coalesce(t.stripe_price_id,'') <> '' or t.monthly_price_cents > 0),
    array(select o.name from public.tier_offerings x join public.sponsor_offerings o on o.code = x.offering_code
          where x.tier_id = t.id order by o.sort_order)
  from public.sponsor_tiers t where t.active order by t.sort_order;
$$;
grant execute on function public.public_sponsor_tiers() to anon, authenticated;
