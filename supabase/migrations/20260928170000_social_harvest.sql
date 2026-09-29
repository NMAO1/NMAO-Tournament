-- Tag/mention harvester (2026-09-28): pull a school's tagged post into the social
-- queue as a branded, consent-gated draft. Enforces the tag-triggered promotion
-- license (only schools that accepted can be harvested). Dedup by source_url.
-- Fed now by the Mission Control "Harvest a tagged post" intake; an automated
-- IG mentions/hashtag discovery cron can call the same RPC later.

alter table public.social_posts add column if not exists source_url text;
create index if not exists social_posts_source_url_idx on public.social_posts (source_url) where source_url is not null;

create or replace function public.social_harvest_add(
  p_source_url text, p_school text, p_media_url text default null, p_caption text default null
) returns public.social_posts
language plpgsql security definer set search_path to 'public','nmao'
as $fn$
declare v_school_id uuid; v_school_name text; v_accepted boolean; r public.social_posts; v_cap text;
begin
  if not nmao.staff_can('social','full') then
    raise exception 'not authorized for social' using errcode='42501';
  end if;
  if coalesce(p_source_url,'') = '' then
    raise exception 'A source URL is required.' using errcode='22023';
  end if;

  if p_school ~* '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    select id, name into v_school_id, v_school_name from public.schools where id = p_school::uuid;
  else
    select id, name into v_school_id, v_school_name from public.schools
      where name ilike p_school order by (name = p_school) desc limit 1;
  end if;
  if v_school_id is null then
    raise exception 'No school matches "%".', p_school using errcode='P0002';
  end if;

  select accepted into v_accepted from public.social_promotion_consent where school_id = v_school_id;
  if not coalesce(v_accepted, false) then
    raise exception '% has not accepted the NMAO Promotion license yet.', v_school_name using errcode='P0001';
  end if;

  select * into r from public.social_posts where source_url = p_source_url limit 1;
  if found then return r; end if;

  v_cap := coalesce(nullif(p_caption, ''),
    'We spotted this from ' || v_school_name || ' — this is the standard. ' ||
    'Huge shoutout to the team raising athletes who train with heart. Continue the path.');

  insert into public.social_posts (sort_order, pillar, title, format, platforms, hook, caption, hashtags,
    media_note, cta_url, needs_consent, status, source_event, source_url, media_url)
  values (0, 'School Spotlight', 'Featured: ' || v_school_name, 'Reel',
    array['Instagram','TikTok','YouTube'],
    'Straight from the mat.',
    v_cap,
    '#martialarts #dojo #studentspotlight #community #karate #taekwondo #nmao',
    'Harvested from a tagged post — confirm the signed media release before publishing. Source: ' || p_source_url,
    'https://directory.nmao.us/?utm_source=social&utm_medium=organic&utm_campaign=harvest',
    true, 'pending', 'harvest:' || md5(p_source_url), p_source_url, nullif(p_media_url, ''))
  returning * into r;
  return r;
end $fn$;
grant execute on function public.social_harvest_add(text,text,text,text) to authenticated;
