-- ============================================================
--  Sponsor network — Phase 1: real, staff-managed sponsors + store + house ads.
--
--  Builds on 20260818020000_duel_sponsors.sql (the flat ad table + Arena
--  interstitial that already serve). Adds the brand/tier/product/analytics model,
--  promotes duel_sponsors into a sponsor-owned ad table, adds HOUSE ADS (NMAO's
--  own promos that fill the slot when no paid sponsor is live), the STORE feed,
--  click tracking, and the staff (Mission Control) management RPCs.
--
--  All tables are RLS-on with NO app policies — every read/write goes through the
--  SECURITY DEFINER RPCs below (app: anon/authenticated; staff: gated on
--  nmao.is_staff()) or the service role. Billing (Stripe) is Phase 2, so tier
--  price/stripe columns ship dormant; real-checkout product fields ship dormant too.
-- ============================================================

-- ---- tiers -------------------------------------------------------------------
create table if not exists public.sponsor_tiers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  code               text unique not null,
  monthly_price_cents int not null default 0,   -- Phase 2 (billing)
  stripe_price_id    text,                        -- Phase 2
  ad_weight          int not null default 1,      -- Arena rotation frequency
  product_slots      int not null default 3,      -- max store products
  prize_slots        int not null default 0,      -- Phase 3
  placements         text[] not null default '{arena,store}',
  sort_order         int not null default 0,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

insert into public.sponsor_tiers (name, code, ad_weight, product_slots, prize_slots, placements, sort_order)
values
  ('Supporter', 'supporter', 1, 3,  0, '{arena,store}',              1),
  ('Partner',   'partner',   3, 8,  1, '{arena,store,store_featured}', 2),
  ('Champion',  'champion',  6, 999,999,'{arena,store,store_featured,event_title}', 3)
on conflict (code) do nothing;

-- ---- sponsors (the brand) ----------------------------------------------------
create table if not exists public.sponsors (
  id                uuid primary key default gen_random_uuid(),
  company_name      text not null,
  tagline           text,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  website           text,
  logo_url          text,
  status            text not null default 'pending',   -- pending|active|suspended|rejected|lapsed
  tier_id           uuid references public.sponsor_tiers(id),
  stripe_customer_id     text,                          -- Phase 2
  stripe_subscription_id text,                          -- Phase 2
  auth_user_id      uuid,                                -- Phase 3 (sponsor portal)
  notes             text,
  approved_by       uuid,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_sponsors_status on public.sponsors(status);

-- ---- products (link-out catalog; real-checkout fields dormant) ---------------
create table if not exists public.sponsor_products (
  id            uuid primary key default gen_random_uuid(),
  sponsor_id    uuid not null references public.sponsors(id) on delete cascade,
  name          text not null,
  description   text,
  image_url     text,
  price_display text,                 -- "$29.99" shown on the card (link-out phase)
  product_url   text not null,        -- opens the sponsor's own store
  active        boolean not null default true,
  sort_order    int not null default 0,
  clicks        bigint not null default 0,
  approved_by   uuid,
  approved_at   timestamptz,
  -- Phase 4 (real in-app checkout + shipping) — dormant for now:
  price_cents   int,
  sku           text,
  ships         boolean not null default false,
  weight_oz     int,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sponsor_products_sponsor on public.sponsor_products(sponsor_id);

-- ---- analytics event log -----------------------------------------------------
create table if not exists public.sponsor_events (
  id            bigint generated always as identity primary key,
  sponsor_id    uuid,
  ad_id         uuid,
  product_id    uuid,
  kind          text not null,        -- impression | ad_click | product_click
  competitor_id uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_sponsor_events_sponsor on public.sponsor_events(sponsor_id, created_at);

-- ---- promote duel_sponsors into a sponsor-owned ad table ---------------------
alter table public.duel_sponsors add column if not exists sponsor_id  uuid references public.sponsors(id) on delete cascade;
alter table public.duel_sponsors add column if not exists poster_url  text;
alter table public.duel_sponsors add column if not exists clicks      bigint not null default 0;
alter table public.duel_sponsors add column if not exists placement   text not null default 'arena';
alter table public.duel_sponsors add column if not exists is_house    boolean not null default false;  -- NMAO promo, no paid sponsor
alter table public.duel_sponsors add column if not exists approved_by uuid;
alter table public.duel_sponsors add column if not exists approved_at timestamptz;

-- ---- storage: staff-managed public buckets for clips + brand assets ----------
insert into storage.buckets (id, name, public) values ('sponsor-assets','sponsor-assets', true) on conflict (id) do nothing;

do $$ begin
  -- staff may upload/replace/remove sponsor clips + assets; read stays public.
  if not exists (select 1 from pg_policies where policyname = 'sponsor_media_staff_write') then
    create policy "sponsor_media_staff_write" on storage.objects for insert to authenticated
      with check (bucket_id in ('sponsor-videos','sponsor-assets') and nmao.is_staff());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'sponsor_media_staff_update') then
    create policy "sponsor_media_staff_update" on storage.objects for update to authenticated
      using (bucket_id in ('sponsor-videos','sponsor-assets') and nmao.is_staff());
  end if;
  if not exists (select 1 from pg_policies where policyname = 'sponsor_media_staff_delete') then
    create policy "sponsor_media_staff_delete" on storage.objects for delete to authenticated
      using (bucket_id in ('sponsor-videos','sponsor-assets') and nmao.is_staff());
  end if;
end $$;

-- ---- RLS on (served exclusively via the RPCs below / service role) -----------
alter table public.sponsor_tiers    enable row level security;
alter table public.sponsors         enable row level security;
alter table public.sponsor_products enable row level security;
alter table public.sponsor_events   enable row level security;

-- =====================================================================
--  APP-FACING RPCs
-- =====================================================================

-- Serve one ad: a PAID active-sponsor ad (weighted), else fall back to a HOUSE
-- ad so the slot is never wasted. Return type changed (adds logo/is_house) → drop first.
drop function if exists public.duel_sponsor();
create function public.duel_sponsor()
returns table (id uuid, name text, tagline text, video_url text, click_url text, min_seconds int, logo_url text, is_house boolean)
language sql stable security definer set search_path = public as $$
  with paid as (
    select ds.id, coalesce(sp.company_name, ds.name) as name, ds.tagline, ds.video_url, ds.click_url,
           ds.min_seconds, sp.logo_url, false as is_house, -ln(random()) / greatest(ds.weight, 1) as k
    from public.duel_sponsors ds
    join public.sponsors sp on sp.id = ds.sponsor_id
    where ds.active and ds.weight > 0 and coalesce(ds.video_url,'') <> ''
      and ds.approved_at is not null and sp.status = 'active'
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

-- Count a view + log the event.
create or replace function public.duel_sponsor_impression(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update public.duel_sponsors set impressions = impressions + 1 where id = p_id;
  insert into public.sponsor_events (sponsor_id, ad_id, kind)
  select sponsor_id, id, 'impression' from public.duel_sponsors where id = p_id;
end $$;

-- Count a click (ad "Learn more" or a store product).
create or replace function public.sponsor_click(p_kind text, p_ad uuid default null, p_product uuid default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_sponsor uuid;
begin
  if p_kind = 'ad_click' and p_ad is not null then
    update public.duel_sponsors set clicks = clicks + 1 where id = p_ad returning sponsor_id into v_sponsor;
    insert into public.sponsor_events (sponsor_id, ad_id, kind) values (v_sponsor, p_ad, 'ad_click');
  elsif p_kind = 'product_click' and p_product is not null then
    update public.sponsor_products set clicks = clicks + 1 where id = p_product returning sponsor_id into v_sponsor;
    insert into public.sponsor_events (sponsor_id, product_id, kind) values (v_sponsor, p_product, 'product_click');
  end if;
end $$;

-- The Store feed — approved, active products of active sponsors, grouped by brand.
create or replace function public.store_products()
returns table (id uuid, sponsor_id uuid, sponsor_name text, sponsor_logo text, name text,
               description text, image_url text, price_display text, product_url text, sort_order int)
language sql stable security definer set search_path = public as $$
  select p.id, p.sponsor_id, sp.company_name, sp.logo_url, p.name, p.description,
         p.image_url, p.price_display, p.product_url, p.sort_order
  from public.sponsor_products p
  join public.sponsors sp on sp.id = p.sponsor_id
  where p.active and p.approved_at is not null and sp.status = 'active'
  order by sp.company_name, p.sort_order, p.name;
$$;

-- =====================================================================
--  STAFF RPCs (Mission Control) — all gated on nmao.is_staff()
-- =====================================================================

create or replace function public.admin_list_tiers()
returns setof public.sponsor_tiers language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_tiers where active order by sort_order;
end $$;

create or replace function public.admin_list_sponsors()
returns table (id uuid, company_name text, status text, tier_id uuid, tier_name text, logo_url text,
               tagline text, contact_email text, ad_count int, product_count int,
               impressions bigint, clicks bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select s.id, s.company_name, s.status, s.tier_id, t.name, s.logo_url, s.tagline, s.contact_email,
      (select count(*) from public.duel_sponsors d where d.sponsor_id = s.id)::int,
      (select count(*) from public.sponsor_products p where p.sponsor_id = s.id)::int,
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0),
      coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)
        + coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0),
      s.created_at
    from public.sponsors s
    left join public.sponsor_tiers t on t.id = s.tier_id
    order by s.created_at desc;
end $$;

create or replace function public.admin_sponsor_ads(p_sponsor uuid)
returns setof public.duel_sponsors language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.duel_sponsors where sponsor_id = p_sponsor order by created_at desc;
end $$;

create or replace function public.admin_sponsor_products(p_sponsor uuid)
returns setof public.sponsor_products language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query select * from public.sponsor_products where sponsor_id = p_sponsor order by sort_order, name;
end $$;

create or replace function public.admin_upsert_sponsor(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.sponsors (company_name, tagline, contact_name, contact_email, contact_phone, website, logo_url, tier_id, status, notes)
    values (p->>'company_name', p->>'tagline', p->>'contact_name', p->>'contact_email', p->>'contact_phone',
            p->>'website', p->>'logo_url', nullif(p->>'tier_id','')::uuid, coalesce(nullif(p->>'status',''),'pending'), p->>'notes')
    returning id into v_id;
  else
    update public.sponsors set
      company_name = coalesce(p->>'company_name', company_name),
      tagline      = coalesce(p->>'tagline', tagline),
      contact_name = coalesce(p->>'contact_name', contact_name),
      contact_email= coalesce(p->>'contact_email', contact_email),
      contact_phone= coalesce(p->>'contact_phone', contact_phone),
      website      = coalesce(p->>'website', website),
      logo_url     = coalesce(p->>'logo_url', logo_url),
      tier_id      = coalesce(nullif(p->>'tier_id','')::uuid, tier_id),
      notes        = coalesce(p->>'notes', notes),
      updated_at   = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_set_sponsor_status(p_id uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  if p_status not in ('pending','active','suspended','rejected','lapsed') then
    raise exception 'bad status: %', p_status;
  end if;
  update public.sponsors set
    status = p_status,
    approved_by = case when p_status = 'active' then auth.uid() else approved_by end,
    approved_at = case when p_status = 'active' then now() else approved_at end,
    updated_at = now()
  where id = p_id;
end $$;

create or replace function public.admin_upsert_sponsor_ad(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.duel_sponsors (sponsor_id, name, tagline, video_url, poster_url, click_url, weight, min_seconds, active, placement, is_house, approved_by, approved_at)
    values (nullif(p->>'sponsor_id','')::uuid, p->>'name', p->>'tagline', p->>'video_url', p->>'poster_url', p->>'click_url',
            coalesce((p->>'weight')::int, 1), coalesce((p->>'min_seconds')::int, 3),
            coalesce((p->>'active')::boolean, true), coalesce(nullif(p->>'placement',''),'arena'),
            coalesce((p->>'is_house')::boolean, false), auth.uid(), now())
    returning id into v_id;
  else
    update public.duel_sponsors set
      name        = coalesce(p->>'name', name),
      tagline     = coalesce(p->>'tagline', tagline),
      video_url   = coalesce(p->>'video_url', video_url),
      poster_url  = coalesce(p->>'poster_url', poster_url),
      click_url   = coalesce(p->>'click_url', click_url),
      weight      = coalesce((p->>'weight')::int, weight),
      min_seconds = coalesce((p->>'min_seconds')::int, min_seconds),
      active      = coalesce((p->>'active')::boolean, active),
      placement   = coalesce(nullif(p->>'placement',''), placement)
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_upsert_sponsor_product(p jsonb)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.sponsor_products (sponsor_id, name, description, image_url, price_display, product_url, active, sort_order, approved_by, approved_at)
    values (nullif(p->>'sponsor_id','')::uuid, p->>'name', p->>'description', p->>'image_url', p->>'price_display',
            p->>'product_url', coalesce((p->>'active')::boolean, true), coalesce((p->>'sort_order')::int, 0), auth.uid(), now())
    returning id into v_id;
  else
    update public.sponsor_products set
      name         = coalesce(p->>'name', name),
      description  = coalesce(p->>'description', description),
      image_url    = coalesce(p->>'image_url', image_url),
      price_display= coalesce(p->>'price_display', price_display),
      product_url  = coalesce(p->>'product_url', product_url),
      active       = coalesce((p->>'active')::boolean, active),
      sort_order   = coalesce((p->>'sort_order')::int, sort_order)
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.admin_sponsor_analytics()
returns table (sponsor_id uuid, company_name text, status text, impressions bigint, ad_clicks bigint, product_clicks bigint, ctr numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select s.id, s.company_name, s.status,
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) as impressions,
      coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0) as ad_clicks,
      coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0) as product_clicks,
      round(
        coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      ) as ctr
    from public.sponsors s
    order by impressions desc;
end $$;

-- ---- grants ------------------------------------------------------------------
revoke all on function public.duel_sponsor() from public;
revoke all on function public.duel_sponsor_impression(uuid) from public;
grant execute on function public.duel_sponsor() to anon, authenticated;
grant execute on function public.duel_sponsor_impression(uuid) to anon, authenticated;
grant execute on function public.sponsor_click(text, uuid, uuid) to anon, authenticated;
grant execute on function public.store_products() to anon, authenticated;

grant execute on function public.admin_list_tiers() to authenticated;
grant execute on function public.admin_list_sponsors() to authenticated;
grant execute on function public.admin_sponsor_ads(uuid) to authenticated;
grant execute on function public.admin_sponsor_products(uuid) to authenticated;
grant execute on function public.admin_upsert_sponsor(jsonb) to authenticated;
grant execute on function public.admin_set_sponsor_status(uuid, text) to authenticated;
grant execute on function public.admin_upsert_sponsor_ad(jsonb) to authenticated;
grant execute on function public.admin_upsert_sponsor_product(jsonb) to authenticated;
grant execute on function public.admin_sponsor_analytics() to authenticated;
