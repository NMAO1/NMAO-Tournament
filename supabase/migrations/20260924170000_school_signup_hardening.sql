-- School signup hardening (2026-09-24): dissuade fake/spam schools on join.nmao.us.
-- Design = APPROVE-ONLY (do not hard-block features) + two automatic signals:
--   (1) EMAIL CONFIRMATION — a school stays email_verified=false until the owner
--       clicks a confirmation link (verify-school-email EF); the password-setup
--       link is deferred until then, so a bad/typo email never gets an account.
--   (2) ADDRESS VALIDATION — register-school structurally validates the shipping
--       address (needed for medals anyway) and stamps address_valid.
-- Plus a Mission Control "School review" queue: staff see email/address/dup
-- signals and can OK / Flag / Remove (remove = status 'suspended', already the
-- payout + join-by-code gate). status itself is NOT repurposed (it gates money),
-- so we add a separate review_status. See [[school-join-antifraud]].

alter table public.schools add column if not exists email_verified    boolean not null default false;
alter table public.schools add column if not exists email_verify_token uuid;
alter table public.schools add column if not exists email_verify_sent_at timestamptz;
alter table public.schools add column if not exists email_verified_at  timestamptz;
alter table public.schools add column if not exists address_valid      boolean;         -- null = not checked
alter table public.schools add column if not exists review_status      text not null default 'pending';
alter table public.schools add column if not exists reviewed_at        timestamptz;
alter table public.schools add column if not exists reviewed_by        uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='schools_review_status_ck') then
    alter table public.schools add constraint schools_review_status_ck
      check (review_status in ('pending','ok','flagged','removed'));
  end if;
end $$;

create index if not exists schools_review_status_idx on public.schools(review_status);
create index if not exists schools_email_verify_token_idx on public.schools(email_verify_token);

-- Owners (authenticated/anon) must not self-flip verification or review columns.
-- register-school / verify-school-email write these as service_role; the review
-- RPCs are SECURITY DEFINER — both bypass this BEFORE-UPDATE guard.
create or replace function public.schools_guard_privileged_cols()
returns trigger language plpgsql as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.accredited                := old.accredited;
    new.external_member_school_id := old.external_member_school_id;
    new.payout_tier_override      := old.payout_tier_override;
    new.payout_tier               := old.payout_tier;
    new.email_verified            := old.email_verified;
    new.email_verify_token        := old.email_verify_token;
    new.email_verified_at         := old.email_verified_at;
    new.address_valid             := old.address_valid;
    new.review_status             := old.review_status;
    new.reviewed_at               := old.reviewed_at;
    new.reviewed_by               := old.reviewed_by;
  end if;
  return new;
end $function$;

-- ---- Mission Control: staff school-review queue ----------------------------
create or replace function public.schools_review_list()
returns table(
  id uuid, name text, contact_email text, phone text, email_verified boolean,
  address jsonb, address_valid boolean, status text, review_status text,
  reviewed_at timestamptz, created_at timestamptz, join_code text,
  has_connect boolean, competitor_count bigint,
  dup_email boolean, dup_phone boolean, dup_name boolean
) language plpgsql stable security definer set search_path = public, nmao as $$
begin
  if not exists (select 1 from public.staff where auth_user_id = auth.uid()) then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return query
  select s.id, s.name, s.contact_email, s.phone, coalesce(s.email_verified,false),
    s.address, s.address_valid, s.status, coalesce(s.review_status,'pending'),
    s.reviewed_at, s.created_at, s.join_code,
    (s.stripe_connect_account_id is not null),
    (select count(*) from public.competitors c where c.school_id = s.id),
    (select count(*) from public.schools o where o.id <> s.id and o.contact_email_norm = s.contact_email_norm) > 0,
    (select count(*) from public.schools o where o.id <> s.id and o.phone is not null and o.phone <> '' and o.phone = s.phone) > 0,
    (select count(*) from public.schools o where o.id <> s.id and lower(trim(o.name)) = lower(trim(s.name))) > 0
  from public.schools s
  where coalesce(s.is_test, false) = false
  order by (coalesce(s.review_status,'pending') = 'pending') desc, s.created_at desc;
end $$;
revoke all on function public.schools_review_list() from public, anon;
grant execute on function public.schools_review_list() to authenticated;

create or replace function public.school_review_decide(p_school_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public, nmao as $$
begin
  if not exists (select 1 from public.staff where auth_user_id = auth.uid()) then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_action = 'ok' then
    update public.schools set review_status='ok', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  elsif p_action = 'flag' then
    update public.schools set review_status='flagged', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  elsif p_action = 'remove' then
    update public.schools set review_status='removed', status='suspended', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  elsif p_action = 'restore' then
    update public.schools set review_status='ok', status='active', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  else
    raise exception 'unknown action: %', p_action using errcode = '22023';
  end if;
  return found;
end $$;
revoke all on function public.school_review_decide(uuid, text) from public, anon;
grant execute on function public.school_review_decide(uuid, text) to authenticated;
