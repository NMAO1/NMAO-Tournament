-- =====================================================================
-- school_leads — inbound interest from the public join.nmao.us landing page.
-- Written only by the capture-school-lead edge function (service role, which
-- bypasses RLS). RLS is ON with NO policies, so anon/authenticated clients can
-- neither read nor write directly — leads are not publicly enumerable, and the
-- public form cannot be used to scrape or tamper with the table.
-- =====================================================================

create table if not exists public.school_leads (
  id           uuid primary key default gen_random_uuid(),
  school_name  text not null,
  email        text not null,
  phone        text,
  source       text not null default 'join.nmao.us',
  user_agent   text,
  created_at   timestamptz not null default now()
);

comment on table public.school_leads is
  'Inbound school-interest leads from the public join.nmao.us landing page. Insert-only via the capture-school-lead edge function (service role).';

-- Owner/staff review by recency.
create index if not exists school_leads_created_idx on public.school_leads (created_at desc);

-- Lock it down: RLS on, no policies -> only service_role (RLS-bypassing) touches it.
alter table public.school_leads enable row level security;

-- Belt-and-suspenders: revoke any default table grants from public API roles so
-- neither anon nor authenticated can select/insert directly.
revoke all on public.school_leads from anon, authenticated;
