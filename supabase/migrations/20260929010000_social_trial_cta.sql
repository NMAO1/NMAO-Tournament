-- Closed-loop CTAs: spotlight/harvest social posts drive to the promoted school's
-- public trial page (app.nmao.us/book.html?slug=…) with UTM, so leads are attributed.
-- schools.trial_url is auto-populated by bridge-provision-school (from the member slug)
-- when a school enables Tournaments; falls back to the directory when absent.
alter table public.schools add column if not exists trial_url text;

create or replace function public.nmao_social_cta(p_trial text, p_campaign text, p_default text)
returns text language sql immutable as $$
  select case when coalesce(p_trial,'') <> ''
    then p_trial || case when position('?' in p_trial) > 0 then '&' else '?' end
         || 'utm_source=social&utm_medium=organic&utm_campaign=' || p_campaign
    else p_default end;
$$;

-- social_on_result_win, social_on_accredited and social_harvest_add updated to build
-- cta_url via nmao_social_cta(<school>.trial_url, '<campaign>', '<directory fallback>').
-- (Full bodies applied 2026-09-29; see the functions in the DB — this migration records
-- the column + helper that they depend on.)
