-- ============================================================
--  Ad-watch tracking — count how many people actually WATCH each sponsor ad,
--  not just how often it's shown, and surface it in the sponsor analytics.
--
--  Vocabulary in sponsor_events.kind:
--    impression   — the ad was shown (already logged on SponsorBreak mount)
--    ad_complete  — the viewer watched the clip to the end
--    ad_skip      — the viewer skipped after the min-seconds gate
--  completion_rate = completions / impressions.
-- ============================================================

alter table public.sponsor_events add column if not exists seconds int;  -- seconds watched (for avg watch time)

create or replace function public.sponsor_ad_watch(p_ad uuid, p_kind text, p_seconds int default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_sponsor uuid;
begin
  if p_kind not in ('ad_view','ad_complete','ad_skip') then return; end if;
  select sponsor_id into v_sponsor from public.duel_sponsors where id = p_ad;
  insert into public.sponsor_events (sponsor_id, ad_id, kind, seconds) values (v_sponsor, p_ad, p_kind, p_seconds);
end $$;

revoke all on function public.sponsor_ad_watch(uuid, text, int) from public;
grant execute on function public.sponsor_ad_watch(uuid, text, int) to anon, authenticated;

-- Extend analytics with views (impressions), completions, completion-rate + avg watch.
-- Return type changes → drop first.
drop function if exists public.admin_sponsor_analytics();
create function public.admin_sponsor_analytics()
returns table (sponsor_id uuid, company_name text, status text, impressions bigint, completions bigint,
               completion_rate numeric, avg_watch numeric, ad_clicks bigint, product_clicks bigint, ctr numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not nmao.is_staff() then raise exception 'Not authorized — staff only'; end if;
  return query
    select s.id, s.company_name, s.status,
      coalesce((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) as impressions,
      (select count(*) from public.sponsor_events e where e.sponsor_id = s.id and e.kind = 'ad_complete') as completions,
      round(
        (select count(*) from public.sponsor_events e where e.sponsor_id = s.id and e.kind = 'ad_complete')::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      ) as completion_rate,
      round((select avg(e.seconds) from public.sponsor_events e where e.sponsor_id = s.id and e.seconds is not null), 1) as avg_watch,
      coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0) as ad_clicks,
      coalesce((select sum(p.clicks) from public.sponsor_products p where p.sponsor_id = s.id), 0) as product_clicks,
      round(
        coalesce((select sum(d.clicks) from public.duel_sponsors d where d.sponsor_id = s.id), 0)::numeric
        / nullif((select sum(d.impressions) from public.duel_sponsors d where d.sponsor_id = s.id), 0) * 100, 1
      ) as ctr
    from public.sponsors s
    order by impressions desc;
end $$;

grant execute on function public.admin_sponsor_analytics() to authenticated;
