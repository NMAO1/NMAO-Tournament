-- ============================================================
--  Sponsor POS foundation — an editable offerings catalog (price + thumbnail,
--  no more SQL seeds) + à-la-carte checkout. Staff edit the "menu" in Mission
--  Control like retail products; a sponsor's cart (à-la-carte items and/or a
--  bundle tier) checks out as a Stripe subscription; the webhook grants exactly
--  the purchased offerings.
-- ============================================================

alter table public.sponsor_offerings add column if not exists thumbnail_url text;
alter table public.sponsor_offerings add column if not exists billing text not null default 'monthly';  -- monthly | once

-- Seed sensible starter à-la-carte prices (staff edit in MC). Recurring monthly
-- unless it's a one-off (prize / giveaway).
update public.sponsor_offerings set default_price_cents = 3900, billing = 'monthly' where code = 'ad_space'            and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 1900, billing = 'monthly' where code = 'product_listing'     and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 2900, billing = 'monthly' where code = 'store_featured'      and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 3900, billing = 'monthly' where code = 'logo_banner'         and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 9900, billing = 'monthly' where code = 'reveal_sponsor'      and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 2900, billing = 'monthly' where code = 'custom_frame'        and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 9900, billing = 'monthly' where code = 'title_sponsor'       and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 2900, billing = 'monthly' where code = 'sponsored_challenge' and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 1900, billing = 'monthly' where code = 'discount_code'       and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 1900, billing = 'monthly' where code = 'sponsor_spotlight'   and default_price_cents = 0;
update public.sponsor_offerings set default_price_cents = 2900, billing = 'monthly' where code = 'newsletter_placement' and default_price_cents = 0;
update public.sponsor_offerings set billing = 'once' where code in ('sponsored_prize','giveaway_sampling');

-- Staff: create / edit an offering (the catalog is now editable, no migrations).
create or replace function public.admin_upsert_offering(p jsonb)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_code text := lower(regexp_replace(coalesce(nullif(p->>'code',''), p->>'name'), '[^a-z0-9]+', '_', 'g'));
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  if coalesce(v_code,'') = '' then raise exception 'name or code required'; end if;
  insert into public.sponsor_offerings (code, name, category, description, default_price_cents, billing, thumbnail_url, live, sort_order, active)
  values (v_code, coalesce(nullif(p->>'name',''), v_code), coalesce(nullif(p->>'category',''),'placement'), p->>'description',
          coalesce((p->>'default_price_cents')::int, 0), coalesce(nullif(p->>'billing',''),'monthly'), p->>'thumbnail_url',
          coalesce((p->>'live')::boolean, false), coalesce((p->>'sort_order')::int, 500), coalesce((p->>'active')::boolean, true))
  on conflict (code) do update set
    name = coalesce(nullif(p->>'name',''), public.sponsor_offerings.name),
    category = coalesce(nullif(p->>'category',''), public.sponsor_offerings.category),
    description = coalesce(p->>'description', public.sponsor_offerings.description),
    default_price_cents = coalesce((p->>'default_price_cents')::int, public.sponsor_offerings.default_price_cents),
    billing = coalesce(nullif(p->>'billing',''), public.sponsor_offerings.billing),
    thumbnail_url = coalesce(p->>'thumbnail_url', public.sponsor_offerings.thumbnail_url),
    live = coalesce((p->>'live')::boolean, public.sponsor_offerings.live),
    sort_order = coalesce((p->>'sort_order')::int, public.sponsor_offerings.sort_order),
    active = coalesce((p->>'active')::boolean, public.sponsor_offerings.active);
  return v_code;
end $$;
grant execute on function public.admin_upsert_offering(jsonb) to authenticated;

-- Grant an explicit set of offerings to a sponsor (webhook, on à-la-carte payment).
create or replace function public.grant_offering_entitlements(p_sponsor uuid, p_codes text[])
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  select p_sponsor, unnest(p_codes), 'purchase', true
  on conflict (sponsor_id, offering_code) do update set active = true;
end $$;
grant execute on function public.grant_offering_entitlements(uuid, text[]) to service_role;

-- Public catalog for the signup page's à-la-carte view (live + priced items).
create or replace function public.public_offerings()
returns table (code text, name text, category text, description text, price_cents int, billing text, thumbnail_url text)
language sql stable security definer set search_path = public as $$
  select code, name, category, description, default_price_cents, billing, thumbnail_url
  from public.sponsor_offerings where active and live and default_price_cents > 0 order by sort_order;
$$;
grant execute on function public.public_offerings() to anon, authenticated;
