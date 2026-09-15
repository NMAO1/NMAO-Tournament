-- =====================================================================
-- AMBASSADOR PORTAL — summary v2: add per-school tournament ENTRY counts.
-- Extends partner_portal_summary() so the dashboard can show, per referred
-- school, how many paid entries (the $1 stream) and competitors it has driven.
-- Still DOLLAR-MASKED — counts only, never amounts. Idempotent (create or replace).
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
      ),
      'entries_total', (
        select count(*) from public.partner_event_payouts pep
         where pep.partner_id = (select id from me)
      )
    ),
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', coalesce(a.school_name, 'School'),
               'active', a.active,
               'attributed_at', a.attributed_at,
               'entries', (
                 select count(*) from public.partner_event_payouts pep
                  where pep.partner_id = a.partner_id
                    and pep.member_school_id = a.member_school_id
               ),
               'competitors', (
                 select count(distinct pep.competitor_id) from public.partner_event_payouts pep
                  where pep.partner_id = a.partner_id
                    and pep.member_school_id = a.member_school_id
               )
             ) order by a.attributed_at desc)
        from public.partner_school_attributions a
       where a.partner_id = (select id from me)
    ), '[]'::jsonb)
  ) end
$$;

revoke all on function public.partner_portal_summary() from public, anon;
grant execute on function public.partner_portal_summary() to authenticated;
