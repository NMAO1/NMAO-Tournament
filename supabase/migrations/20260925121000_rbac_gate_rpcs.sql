-- RBAC (2026-09-25): gate the schools + social RPCs by capability slice.
-- Bodies are unchanged except the staff guard, which now checks staff_can()
-- instead of bare "is this person staff?". Owner/admin/organizer pass all.

-- ---- schools ----
create or replace function public.schools_review_list()
returns table(
  id uuid, name text, contact_email text, phone text, email_verified boolean,
  address jsonb, address_valid boolean, status text, review_status text,
  reviewed_at timestamptz, created_at timestamptz, join_code text,
  has_connect boolean, competitor_count bigint,
  dup_email boolean, dup_phone boolean, dup_name boolean
) language plpgsql stable security definer set search_path = public, nmao as $$
begin
  if not nmao.staff_can('schools', 'view') then
    raise exception 'not authorized for schools' using errcode = '42501';
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

create or replace function public.school_review_decide(p_school_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = public, nmao as $$
begin
  -- flag = triage (Community can tee up); ok / remove / restore are full-only.
  if p_action = 'flag' then
    if not nmao.staff_can('schools', 'triage') then raise exception 'not authorized for schools' using errcode = '42501'; end if;
    update public.schools set review_status='flagged', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  elsif p_action = 'ok' then
    if not nmao.staff_can('schools') then raise exception 'not authorized for schools' using errcode = '42501'; end if;
    update public.schools set review_status='ok', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  elsif p_action = 'remove' then
    if not nmao.staff_can('schools') then raise exception 'not authorized for schools' using errcode = '42501'; end if;
    update public.schools set review_status='removed', status='suspended', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  elsif p_action = 'restore' then
    if not nmao.staff_can('schools') then raise exception 'not authorized for schools' using errcode = '42501'; end if;
    update public.schools set review_status='ok', status='active', reviewed_at=now(), reviewed_by=auth.uid() where id=p_school_id;
  else
    raise exception 'unknown action: %', p_action using errcode = '22023';
  end if;
  return found;
end $$;

-- ---- social ----
create or replace function public.social_posts_list()
returns setof social_posts language sql stable security definer set search_path = public, nmao as $$
  select * from public.social_posts
  where nmao.staff_can('social', 'view')
  order by sort_order, created_at;
$$;

create or replace function public.social_brand_media_list()
returns setof social_brand_media language sql stable security definer set search_path = public, nmao as $$
  select * from public.social_brand_media
  where nmao.staff_can('social', 'view')
  order by kind, label;
$$;

create or replace function public.social_brand_media_add(p_label text, p_url text, p_tags text[], p_kind text)
returns social_brand_media language plpgsql security definer set search_path = public, nmao as $$
declare r public.social_brand_media;
begin
  if not nmao.staff_can('social', 'upload') then
    raise exception 'not authorized for social' using errcode = '42501';
  end if;
  insert into public.social_brand_media (label, url, tags, kind)
  values (p_label, p_url, coalesce(p_tags,'{}'), coalesce(nullif(p_kind,''),'video'))
  returning * into r;
  return r;
end $$;

create or replace function public.social_post_save(p_id uuid, p_patch jsonb)
returns social_posts language plpgsql security definer set search_path = public, nmao as $$
declare r public.social_posts;
begin
  if not nmao.staff_can('social', 'full') then
    raise exception 'not authorized for social' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.social_posts
      (pillar, title, format, platforms, hook, caption, hashtags, media_note, shot_list, on_screen,
       media_url, cta_url, needs_consent, status, scheduled_at, sort_order)
    values (
      p_patch->>'pillar', p_patch->>'title', p_patch->>'format',
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'platforms') x), '{}'),
      p_patch->>'hook', p_patch->>'caption', p_patch->>'hashtags', p_patch->>'media_note',
      p_patch->>'shot_list', p_patch->>'on_screen', p_patch->>'media_url', p_patch->>'cta_url',
      coalesce((p_patch->>'needs_consent')::boolean,
               (p_patch->>'pillar') in ('Student Wins','Transformation','School Spotlight')),
      coalesce(p_patch->>'status','pending'),
      case when p_patch ? 'scheduled_at' and length(coalesce(p_patch->>'scheduled_at','')) > 0
           then (p_patch->>'scheduled_at')::timestamptz else null end,
      coalesce((p_patch->>'sort_order')::int, 999)
    ) returning * into r;
    return r;
  end if;
  update public.social_posts set
    caption           = coalesce(p_patch->>'caption', caption),
    hook              = coalesce(p_patch->>'hook', hook),
    hashtags          = coalesce(p_patch->>'hashtags', hashtags),
    media_note        = coalesce(p_patch->>'media_note', media_note),
    media_url         = case when p_patch ? 'media_url' then nullif(p_patch->>'media_url','') else media_url end,
    cta_url           = case when p_patch ? 'cta_url' then nullif(p_patch->>'cta_url','') else cta_url end,
    consent_confirmed = coalesce((p_patch->>'consent_confirmed')::boolean, consent_confirmed),
    needs_consent     = coalesce((p_patch->>'needs_consent')::boolean, needs_consent),
    status            = coalesce(p_patch->>'status', status),
    scheduled_at      = case when p_patch ? 'scheduled_at'
                             then nullif(p_patch->>'scheduled_at','')::timestamptz else scheduled_at end,
    updated_at        = now()
  where id = p_id
  returning * into r;
  return r;
end $$;
