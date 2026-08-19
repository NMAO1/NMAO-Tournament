-- ============================================================
--  Sponsor offerings — the CUSTOMIZABLE menu.
--
--  Instead of hardcoded tiers, define a CATALOG of offerings (what a sponsor can
--  get), grant them per-sponsor as ENTITLEMENTS, and let tiers BUNDLE offerings
--  (+ à la carte add-ons). Every serving/gating check reads entitlements via
--  nmao.sponsor_has(). New offering FEATURES (custom frames, reveal branding, …)
--  ship over later phases and each flips "live" true when its surface is wired.
--
--  Menu chosen 2026-08-18:
--    Built now (live): ad_space, product_listing
--    Competition:  custom_frame, title_sponsor, sponsored_prize, sponsored_challenge
--    Placement:    store_featured, logo_banner, reveal_sponsor
--    Audience:     discount_code, giveaway_sampling, sponsor_spotlight, newsletter_placement
--  Pricing: tiers bundle offerings AND à la carte add-ons.
-- ============================================================

-- ---- the catalog -------------------------------------------------------------
create table if not exists public.sponsor_offerings (
  code               text primary key,
  name               text not null,
  category           text not null,          -- placement | commerce | competition | audience | reporting
  description        text,
  default_price_cents int not null default 0,
  live               boolean not null default false,  -- its in-app surface is wired
  sort_order         int not null default 0,
  active             boolean not null default true
);

insert into public.sponsor_offerings (code, name, category, description, live, sort_order) values
  ('ad_space',            'Ad space (Arena)',            'placement',  'A 10–15s video ad in the duel Arena, between the Tale of the Path and the vote.', true, 10),
  ('product_listing',     'Product listing (Store)',     'commerce',   'Products in the in-app Store, link-out to the sponsor.', true, 20),
  ('store_featured',      'Store — Featured slot',       'placement',  'A pinned/featured placement at the top of the Store.', false, 30),
  ('logo_banner',         'Logo / banner placement',     'placement',  'Sponsor logo on leaderboards, app header, and the Store home.', false, 40),
  ('reveal_sponsor',      'Monthly-reveal sponsor',      'placement',  '"This month''s champions, presented by ___" on the reveal ceremony.', false, 50),
  ('custom_frame',        'Custom branded frame',        'competition','A sponsor-branded collectible frame competitors equip or earn.', false, 60),
  ('title_sponsor',       'Sponsor a tournament/event',  'competition','"Traditional Forms, presented by ___" title billing on a round or season.', false, 70),
  ('sponsored_prize',     'Sponsored prize',             'competition','A prize the sponsor puts up for champions (prize flow).', false, 80),
  ('sponsored_challenge', 'Sponsored badge/challenge',   'competition','A branded goal competitors chase ("win 5 duels this month").', false, 90),
  ('discount_code',       'Discount code / member offer','audience',   'A promo code offered to NMAO members.', false, 100),
  ('giveaway_sampling',   'Giveaway / product sampling', 'audience',   'Physical samples to participants, shipped to the dojo.', false, 110),
  ('sponsor_spotlight',   'Sponsor spotlight page',      'audience',   'An "Our Sponsors" / brand-story feature in-app.', false, 120),
  ('newsletter_placement','Newsletter / email placement','audience',   'A placement in NMAO''s member emails.', false, 130)
on conflict (code) do nothing;

-- ---- per-sponsor entitlements (what each sponsor actually has) ----------------
create table if not exists public.sponsor_entitlements (
  id            uuid primary key default gen_random_uuid(),
  sponsor_id    uuid not null references public.sponsors(id) on delete cascade,
  offering_code text not null references public.sponsor_offerings(code),
  config        jsonb not null default '{}'::jsonb,   -- offering-specific settings
  source        text not null default 'addon',        -- tier | addon | comp
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (sponsor_id, offering_code)
);
create index if not exists idx_sponsor_entitlements_sponsor on public.sponsor_entitlements(sponsor_id);
alter table public.sponsor_offerings   enable row level security;
alter table public.sponsor_entitlements enable row level security;

-- ---- tiers BUNDLE offerings --------------------------------------------------
create table if not exists public.tier_offerings (
  tier_id       uuid not null references public.sponsor_tiers(id) on delete cascade,
  offering_code text not null references public.sponsor_offerings(code),
  primary key (tier_id, offering_code)
);
alter table public.tier_offerings enable row level security;

insert into public.tier_offerings (tier_id, offering_code)
select t.id, o.code from public.sponsor_tiers t
  join (values ('ad_space'),('product_listing')) o(code) on true where t.code = 'supporter'
on conflict do nothing;
insert into public.tier_offerings (tier_id, offering_code)
select t.id, o.code from public.sponsor_tiers t
  join (values ('ad_space'),('product_listing'),('store_featured'),('logo_banner'),('sponsored_challenge'),('discount_code')) o(code) on true
  where t.code = 'partner'
on conflict do nothing;
insert into public.tier_offerings (tier_id, offering_code)
select t.id, o.code from public.sponsor_tiers t, public.sponsor_offerings o where t.code = 'champion'
on conflict do nothing;

-- ---- gating helper -----------------------------------------------------------
create or replace function nmao.sponsor_has(p_sponsor uuid, p_offering text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sponsor_entitlements e
    where e.sponsor_id = p_sponsor and e.offering_code = p_offering and e.active
  );
$$;

-- ---- gate the two live surfaces on entitlements ------------------------------
create or replace function public.duel_sponsor()
returns table (id uuid, name text, tagline text, video_url text, click_url text, min_seconds int, logo_url text, is_house boolean)
language sql stable security definer set search_path = public as $$
  with paid as (
    select ds.id, coalesce(sp.company_name, ds.name) as name, ds.tagline, ds.video_url, ds.click_url,
           ds.min_seconds, sp.logo_url, false as is_house, -ln(random()) / greatest(ds.weight, 1) as k
    from public.duel_sponsors ds
    join public.sponsors sp on sp.id = ds.sponsor_id
    where ds.active and ds.weight > 0 and coalesce(ds.video_url,'') <> ''
      and ds.approved_at is not null and sp.status = 'active'
      and nmao.sponsor_has(sp.id, 'ad_space')
  ),
  house as (
    select ds.id, ds.name, ds.tagline, ds.video_url, ds.click_url,
           ds.min_seconds, null::text as logo_url, true as is_house, -ln(random()) / greatest(ds.weight, 1) as k
    from public.duel_sponsors ds
    where ds.active and ds.weight > 0 and coalesce(ds.video_url,'') <> '' and ds.is_house
  ),
  pick as (
    select * from paid
    union all
    select * from house where not exists (select 1 from paid)
  )
  select id, name, tagline, video_url, click_url, min_seconds, logo_url, is_house
  from pick order by k limit 1;
$$;

create or replace function public.store_products()
returns table (id uuid, sponsor_id uuid, sponsor_name text, sponsor_logo text, name text,
               description text, image_url text, price_display text, product_url text, sort_order int)
language sql stable security definer set search_path = public as $$
  select p.id, p.sponsor_id, sp.company_name, sp.logo_url, p.name, p.description,
         p.image_url, p.price_display, p.product_url, p.sort_order
  from public.sponsor_products p
  join public.sponsors sp on sp.id = p.sponsor_id
  where p.active and p.approved_at is not null and sp.status = 'active'
    and nmao.sponsor_has(sp.id, 'product_listing')
  order by sp.company_name, p.sort_order, p.name;
$$;

-- Auto-grant the matching entitlement when staff add content, so there's no
-- "I added an ad but nothing shows" footgun. Staff can still revoke it.
create or replace function public.admin_upsert_sponsor_ad(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.duel_sponsors (sponsor_id, name, tagline, video_url, poster_url, click_url, weight, min_seconds, active, placement, is_house, approved_by, approved_at)
    values (v_sponsor, p->>'name', p->>'tagline', p->>'video_url', p->>'poster_url', p->>'click_url',
            coalesce((p->>'weight')::int, 1), coalesce((p->>'min_seconds')::int, 3),
            coalesce((p->>'active')::boolean, true), coalesce(nullif(p->>'placement',''),'arena'),
            coalesce((p->>'is_house')::boolean, false), auth.uid(), now())
    returning id into v_id;
    if v_sponsor is not null and not coalesce((p->>'is_house')::boolean, false) then
      insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
      values (v_sponsor, 'ad_space', 'auto', true)
      on conflict (sponsor_id, offering_code) do update set active = true;
    end if;
  else
    update public.duel_sponsors set
      name=coalesce(p->>'name',name), tagline=coalesce(p->>'tagline',tagline),
      video_url=coalesce(p->>'video_url',video_url), poster_url=coalesce(p->>'poster_url',poster_url),
      click_url=coalesce(p->>'click_url',click_url), weight=coalesce((p->>'weight')::int,weight),
      min_seconds=coalesce((p->>'min_seconds')::int,min_seconds), active=coalesce((p->>'active')::boolean,active),
      placement=coalesce(nullif(p->>'placement',''),placement)
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_upsert_sponsor_product(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_sponsor uuid := nullif(p->>'sponsor_id','')::uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.sponsor_products (sponsor_id, name, description, image_url, price_display, product_url, active, sort_order, approved_by, approved_at)
    values (v_sponsor, p->>'name', p->>'description', p->>'image_url', p->>'price_display',
            p->>'product_url', coalesce((p->>'active')::boolean, true), coalesce((p->>'sort_order')::int, 0), auth.uid(), now())
    returning id into v_id;
    if v_sponsor is not null then
      insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
      values (v_sponsor, 'product_listing', 'auto', true)
      on conflict (sponsor_id, offering_code) do update set active = true;
    end if;
  else
    update public.sponsor_products set
      name=coalesce(p->>'name',name), description=coalesce(p->>'description',description),
      image_url=coalesce(p->>'image_url',image_url), price_display=coalesce(p->>'price_display',price_display),
      product_url=coalesce(p->>'product_url',product_url), active=coalesce((p->>'active')::boolean,active),
      sort_order=coalesce((p->>'sort_order')::int,sort_order)
    where id = v_id;
  end if;
  return v_id;
end $$;

-- =====================================================================
--  STAFF RPCs — offerings / entitlements management
-- =====================================================================
create or replace function public.admin_list_offerings()
returns setof public.sponsor_offerings language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_offerings where active order by sort_order;
end $$;

-- The full menu with per-sponsor on/off state (drives the MC checklist).
create or replace function public.admin_sponsor_entitlements(p_sponsor uuid)
returns table (code text, name text, category text, live boolean, has boolean, source text, sort_order int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select o.code, o.name, o.category, o.live, coalesce(e.active, false), e.source, o.sort_order
    from public.sponsor_offerings o
    left join public.sponsor_entitlements e on e.offering_code = o.code and e.sponsor_id = p_sponsor
    where o.active order by o.sort_order;
end $$;

create or replace function public.admin_set_entitlement(p_sponsor uuid, p_offering text, p_active boolean, p_config jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, active, config, source)
  values (p_sponsor, p_offering, p_active, coalesce(p_config,'{}'::jsonb), 'addon')
  on conflict (sponsor_id, offering_code) do update set active = excluded.active, config = excluded.config;
end $$;

-- Apply a tier: set the sponsor's tier and grant all of that tier's bundled offerings.
create or replace function public.admin_apply_tier(p_sponsor uuid, p_tier uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  update public.sponsors set tier_id = p_tier, updated_at = now() where id = p_sponsor;
  insert into public.sponsor_entitlements (sponsor_id, offering_code, source, active)
  select p_sponsor, t.offering_code, 'tier', true from public.tier_offerings t where t.tier_id = p_tier
  on conflict (sponsor_id, offering_code) do update set active = true, source = 'tier';
end $$;

grant execute on function public.admin_list_offerings() to authenticated;
grant execute on function public.admin_sponsor_entitlements(uuid) to authenticated;
grant execute on function public.admin_set_entitlement(uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.admin_apply_tier(uuid, uuid) to authenticated;
