-- Event-driven Student Spotlight (2026-09-28): when a competitor WINS a real round
-- (placement 1, elite score >= 80, has a performance video), auto-draft a Student
-- Spotlight into the social queue that showcases their form and shouts out their school.
-- Pending + consent-gated (competitors are often minors); dedup by source_event;
-- skips demo/test rounds (seq >= 900). Mirrors social_on_accredited / social_on_round_finalized.
create or replace function public.social_on_result_win()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  e record; v_school text; v_first text; v_last text; v_event text; v_title text; v_shout text;
begin
  if NEW.placement <> 1 or coalesce(NEW.score, 0) < 80 then return NEW; end if;
  select en.video_url as video_url, en.event as event, c.first_name as first_name,
         c.last_name as last_name, c.school_id as school_id, r.seq as seq
    into e
    from entries en
    join competitors c on c.id = en.competitor_id
    join rounds r on r.id = en.round_id
   where en.id = NEW.entry_id;
  if not found then return NEW; end if;
  if coalesce(e.seq, 0) >= 900 then return NEW; end if;               -- skip demo/test rounds
  if e.video_url is null or e.video_url = '' then return NEW; end if;  -- spotlight needs the video
  if exists (select 1 from social_posts where source_event = 'result_win:' || NEW.id) then return NEW; end if;

  select name into v_school from schools where id = e.school_id;
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
    'https://directory.nmao.us/?utm_source=social&utm_medium=organic&utm_campaign=studentspotlight',
    true, 'pending', 'result_win:' || NEW.id, e.video_url);
  return NEW;
end $$;
drop trigger if exists trg_social_on_result_win on public.results;
create trigger trg_social_on_result_win after insert on public.results
  for each row execute function public.social_on_result_win();
