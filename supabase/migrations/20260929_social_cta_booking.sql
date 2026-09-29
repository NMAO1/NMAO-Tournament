-- Close the attribution loop: point per-school social CTAs at the school's public
-- trial-booking page (app.nmao.us/book.html?slug=<slug>) with UTM, so a click that
-- becomes a booked trial writes a leads row with utm_source=social (which the
-- marketing_attribution_rollup then counts). Schools without a booking_slug fall
-- back to the directory. booking_slug = the school's Membership public-booking slug.
alter table public.schools add column if not exists booking_slug text;
-- Pilot: The Art of Self Defense (Tournament) -> Membership slug 'taosd'.
update public.schools set booking_slug = 'taosd'
 where id = 'dc2d4a01-9031-4eaa-b2ee-c62ef06d42da' and coalesce(booking_slug,'') = '';

-- Helper: build a CTA for a school + campaign (booking page when slug set, else directory).
create or replace function public.social_cta(p_slug text, p_campaign text)
returns text language sql immutable as $$
  select case when coalesce(nullif(p_slug,''),'') <> ''
    then 'https://app.nmao.us/book.html?slug=' || p_slug || '&utm_source=social&utm_medium=organic&utm_campaign=' || p_campaign
    else 'https://directory.nmao.us/?utm_source=social&utm_medium=organic&utm_campaign=' || p_campaign end;
$$;

-- 1) Student Spotlight (competitor win) -> that school's trial page.
create or replace function public.social_on_result_win()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e record; v_school text; v_slug text; v_first text; v_last text; v_event text; v_title text; v_shout text;
begin
  if NEW.placement <> 1 or coalesce(NEW.score, 0) < 80 then return NEW; end if;
  select en.video_url as video_url, en.event as event, c.first_name as first_name,
         c.last_name as last_name, c.school_id as school_id, r.seq as seq
    into e
    from entries en join competitors c on c.id = en.competitor_id
    join rounds r on r.id = en.round_id
   where en.id = NEW.entry_id;
  if not found then return NEW; end if;
  if coalesce(e.seq, 0) >= 900 then return NEW; end if;
  if e.video_url is null or e.video_url = '' then return NEW; end if;
  if exists (select 1 from social_posts where source_event = 'result_win:' || NEW.id) then return NEW; end if;

  select name, booking_slug into v_school, v_slug from schools where id = e.school_id;
  v_first := coalesce(nullif(e.first_name, ''), 'A competitor');
  v_last  := case when coalesce(e.last_name, '') <> '' then ' ' || left(e.last_name, 1) || '.' else '' end;
  v_event := initcap(replace(coalesce(nullif(e.event, ''), 'competition'), '_', ' '));
  v_shout := coalesce(nullif(v_school, ''), 'their school');
  v_title := 'Spotlight: ' || v_first || v_last || ' — ' || v_event || ' champion';

  insert into social_posts (sort_order, pillar, title, format, platforms, hook, caption, hashtags,
    media_note, on_screen, shot_list, cta_url, needs_consent, status, source_event, media_url)
  values (0, 'Student Wins', v_title, 'Reel',
    array['Instagram','TikTok','YouTube'],
    'First place. Watch why.',
    v_first || v_last || ' from ' || v_shout || ' just took first in ' || v_event ||
      ' at the NMAO tournament. Precision, discipline, heart — this is the standard. '
      'Huge shoutout to ' || v_shout || ' for raising athletes who compete with honor. Continue the path.',
    '#studentspotlight #champion #martialarts #forms #kata #compete #dojo #nmao',
    'Auto-attached: this competitor''s winning entry video. Confirm the signed media release (parent/guardian for a minor) before publishing.',
    v_first || v_last || ' -> 1st place, ' || v_event || ' -> ' || v_shout,
    E'Use the competitor''s own winning run:\n1. Best 8-12s of the form\n2. On-screen: name + 1st place + school\n3. End card: Continue the path.',
    public.social_cta(v_slug, 'studentspotlight'),
    true, 'pending', 'result_win:' || NEW.id, e.video_url);
  return NEW;
end $$;

-- 2) School Spotlight (newly accredited) -> that school's trial page.
create or replace function public.social_on_accredited()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.accredited = true and coalesce(OLD.accredited, false) = false
     and coalesce(NEW.is_test, false) = false
     and not exists (select 1 from social_posts where source_event = 'accredited:' || NEW.id) then
    insert into social_posts (sort_order, pillar, title, format, platforms, hook, caption, hashtags,
      media_note, on_screen, shot_list, cta_url, needs_consent, status, source_event, media_url)
    values (0, 'School Spotlight', 'Spotlight: ' || NEW.name, 'Reel',
      array['Instagram','TikTok','YouTube'],
      'This school just earned the NMAO seal.',
      NEW.name || ' is now NMAO-accredited — verified integrity, real teaching. We love shouting out schools raising the standard. Find accredited schools in the directory.',
      '#martialartsschool #accredited #dojo #karate #taekwondo #martialarts #nmao',
      'Ask ' || NEW.name || ' for 3-5 short vertical clips (classes, students, the seal on the wall).',
      NEW.name || ' -> Accredited by NMAO -> Verified integrity -> Find them in the directory.',
      E'1. The school + the NMAO seal (0-3s)\n2. A class in motion (3-8s)\n3. A founder/instructor line (8-12s)\n4. Bow out together (12-14s)\n5. End card: Accredited by NMAO + directory (14-15s)',
      public.social_cta(NEW.booking_slug, 'spotlight'),
      true, 'pending', 'accredited:' || NEW.id,
      social_pick_brand_media(array['seal','accredited']));
  end if;
  return NEW;
end $$;

-- 3) Harvested tagged post -> that school's trial page.
create or replace function public.social_harvest_add(
  p_source_url text, p_school text, p_media_url text default null, p_caption text default null
) returns public.social_posts
language plpgsql security definer set search_path to 'public','nmao'
as $fn$
declare v_school_id uuid; v_school_name text; v_slug text; v_accepted boolean; r public.social_posts; v_cap text;
begin
  if not nmao.staff_can('social','full') then
    raise exception 'not authorized for social' using errcode='42501';
  end if;
  if coalesce(p_source_url,'') = '' then
    raise exception 'A source URL is required.' using errcode='22023';
  end if;
  if p_school ~* '^[0-9a-f]{8}-[0-9a-f]{4}-' then
    select id, name, booking_slug into v_school_id, v_school_name, v_slug from public.schools where id = p_school::uuid;
  else
    select id, name, booking_slug into v_school_id, v_school_name, v_slug from public.schools
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
    public.social_cta(v_slug, 'harvest'),
    true, 'pending', 'harvest:' || md5(p_source_url), p_source_url, nullif(p_media_url, ''))
  returning * into r;
  return r;
end $fn$;
grant execute on function public.social_harvest_add(text,text,text,text) to authenticated;
