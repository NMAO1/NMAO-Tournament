-- Social system upgrades (2026-09-24): consent gate, event-triggered drafts,
-- brand-media library, analytics, UTM. Foundation migration.

alter table public.social_posts add column if not exists needs_consent     boolean not null default false;
alter table public.social_posts add column if not exists consent_confirmed boolean not null default false;
alter table public.social_posts add column if not exists metrics           jsonb;
alter table public.social_posts add column if not exists cta_url           text;
alter table public.social_posts add column if not exists source_event      text;   -- e.g. 'accredited:<school>' | 'round:<id>' | null (manual/generated)

-- consent is required for pillars that use real student/child footage
update public.social_posts
   set needs_consent = true
 where pillar in ('Student Wins','Transformation','School Spotlight');

-- ── Brand media library (reusable clips/images the generator can auto-attach) ──
create table if not exists public.social_brand_media (
  id       uuid primary key default gen_random_uuid(),
  label    text not null,
  url      text not null,
  tags     text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.social_brand_media enable row level security;  -- via RPC/staff only

create or replace function public.social_pick_brand_media(p_tags text[])
returns text language sql stable security definer set search_path = public as $$
  select url from public.social_brand_media
  where tags && p_tags
  order by random() limit 1;
$$;

-- ── save RPC: whitelist the new editable fields ──
create or replace function public.social_post_save(p_id uuid, p_patch jsonb)
returns public.social_posts
language plpgsql security definer set search_path = public as $$
declare r public.social_posts;
begin
  if not exists (select 1 from staff s where s.auth_user_id = auth.uid()) then
    raise exception 'staff only' using errcode = '42501';
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
revoke all on function public.social_post_save(uuid, jsonb) from public, anon;
grant execute on function public.social_post_save(uuid, jsonb) to authenticated;
