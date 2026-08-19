-- Fix: sum() returns numeric, but admin_list_sponsors / admin_sponsor_analytics
-- declared the impression/click columns as bigint → "structure of query does not
-- match function result type" once a staff user actually runs them. Cast to bigint.

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
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::bigint,
      (coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)
        + coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0))::bigint,
      s.created_at
    from public.sponsors s
    left join public.sponsor_tiers t on t.id = s.tier_id
    order by s.created_at desc;
end $$;

create or replace function public.admin_sponsor_analytics()
returns table (sponsor_id uuid, company_name text, status text, impressions bigint, completions bigint,
               completion_rate numeric, avg_watch numeric, ad_clicks bigint, product_clicks bigint, ctr numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select s.id, s.company_name, s.status,
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::bigint as impressions,
      (select count(*) from public.sponsor_events e where e.sponsor_id = s.id and e.kind = 'ad_complete')::bigint,
      round(
        (select count(*) from public.sponsor_events e where e.sponsor_id = s.id and e.kind = 'ad_complete')::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      ),
      round((select avg(e.seconds) from public.sponsor_events e where e.sponsor_id = s.id and e.seconds is not null), 1),
      coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::bigint,
      coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0)::bigint,
      round(
        coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      )
    from public.sponsors s
    order by impressions desc;
end $$;
