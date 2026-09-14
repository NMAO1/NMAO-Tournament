-- =====================================================================
-- AMBASSADOR PORTAL — dollar-masked dashboard summary (amb.nmao.us)
-- One SECURITY DEFINER read for the logged-in ambassador's own dashboard:
-- identity, referral links, referred-school list, and COUNTS only. It reads
-- partner_event_payouts server-side to count distinct competitors WITHOUT ever
-- returning any dollar amount — earnings stay deferred to v2 (tax/1099).
-- Returns null if the caller isn't a linked ambassador. Idempotent.
-- =====================================================================

create or replace function public.partner_portal_summary()
returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select id, name, slug, tier, status, payouts_enabled
      from public.partners
     where user_id = auth.uid()
     limit 1
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'partner', (select to_jsonb(m) from me m),
    'referral_links', jsonb_build_object(
      'member',     'https://app.nmao.us/?p='    || (select slug from me),
      'tournament', 'https://league.nmao.us/?p=' || (select slug from me)
    ),
    'counts', jsonb_build_object(
      'schools_active', (
        select count(*) from public.partner_school_attributions a
         where a.partner_id = (select id from me) and a.active
      ),
      'schools_total', (
        select count(*) from public.partner_school_attributions a
         where a.partner_id = (select id from me)
      ),
      'competitors_referred', (
        select count(distinct pep.competitor_id) from public.partner_event_payouts pep
         where pep.partner_id = (select id from me)
      )
    ),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(a.school_name, 'School'),
               'active', a.active,
               'attributed_at', a.attributed_at
             ) order by a.attributed_at desc)
        from public.partner_school_attributions a
       where a.partner_id = (select id from me)
    ), '[]'::jsonb)
  ) end
$$;

revoke all on function public.partner_portal_summary() from public, anon;
grant execute on function public.partner_portal_summary() to authenticated;
