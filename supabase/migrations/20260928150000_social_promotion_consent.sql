-- School-facing "tag-triggered" content & promotion license:
--   * approved_promo_tags: the tag set that grants NMAO the right to feature a post.
--   * social_promotion_consent: per-school acceptance recorded at onboarding.
--   * social_promotion_accept: owner- or social-staff-gated accept RPC.
-- Backs the Promotion section in the school portal (web/app/(school)/school).

create table if not exists public.approved_promo_tags (
  tag text primary key,
  kind text not null default 'hashtag' check (kind in ('hashtag','mention')),
  active boolean not null default true,
  added_at timestamptz not null default now()
);
insert into public.approved_promo_tags(tag, kind) values
 ('@nationalmartialart','mention'),
 ('#nmaoaccredited','hashtag'),
 ('#nmao','hashtag'),
 ('#nmaospotlight','hashtag')
on conflict (tag) do nothing;
alter table public.approved_promo_tags enable row level security;
drop policy if exists approved_promo_tags_read on public.approved_promo_tags;
create policy approved_promo_tags_read on public.approved_promo_tags for select using (true);
grant select on public.approved_promo_tags to authenticated, anon;

create table if not exists public.social_promotion_consent (
  school_id uuid primary key references public.schools(id) on delete cascade,
  agreement_version text not null,
  accepted boolean not null default false,
  allow_paid boolean not null default false,
  accepted_at timestamptz,
  accepted_by_name text,
  accepted_by_auth_user uuid,
  accepted_ip text,
  tags_snapshot text[],
  updated_at timestamptz not null default now()
);
alter table public.social_promotion_consent enable row level security;
drop policy if exists spc_read on public.social_promotion_consent;
create policy spc_read on public.social_promotion_consent for select
  using (school_id in (select nmao.owned_school_ids()) or nmao.staff_can('social','full'));
grant select on public.social_promotion_consent to authenticated;

create or replace function public.social_promotion_accept(
  p_school_id uuid, p_accept boolean, p_allow_paid boolean default false, p_name text default null
) returns public.social_promotion_consent
language plpgsql security definer set search_path to 'public','nmao'
as $fn$
declare r public.social_promotion_consent; v_ok boolean;
begin
  select (p_school_id in (select nmao.owned_school_ids())) or nmao.staff_can('social','full') into v_ok;
  if not coalesce(v_ok,false) then
    raise exception 'not authorized for this school' using errcode='42501';
  end if;
  insert into public.social_promotion_consent as c
    (school_id, agreement_version, accepted, allow_paid, accepted_at,
     accepted_by_name, accepted_by_auth_user, tags_snapshot, updated_at)
  values (
    p_school_id, '2026-09-28', coalesce(p_accept,false), coalesce(p_allow_paid,false),
    case when coalesce(p_accept,false) then now() else null end,
    p_name, auth.uid(),
    (select array_agg(tag order by tag) from public.approved_promo_tags where active),
    now()
  )
  on conflict (school_id) do update set
    agreement_version     = excluded.agreement_version,
    accepted              = excluded.accepted,
    allow_paid            = excluded.allow_paid,
    accepted_at           = case when excluded.accepted then coalesce(c.accepted_at, now()) else null end,
    accepted_by_name      = coalesce(excluded.accepted_by_name, c.accepted_by_name),
    accepted_by_auth_user = excluded.accepted_by_auth_user,
    tags_snapshot         = excluded.tags_snapshot,
    updated_at            = now()
  returning * into r;
  return r;
end $fn$;
grant execute on function public.social_promotion_accept(uuid,boolean,boolean,text) to authenticated;
