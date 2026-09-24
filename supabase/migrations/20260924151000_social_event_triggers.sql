-- Event-triggered social drafts (2026-09-24): real events auto-draft a matching
-- post into the queue (status 'pending', dedup by source_event, real rows only).
-- Auto-attaches a matching brand asset and a UTM'd CTA link.

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
      'https://directory.nmao.us/?utm_source=social&utm_medium=organic&utm_campaign=spotlight',
      true, 'pending', 'accredited:' || NEW.id,
      social_pick_brand_media(array['seal','accredited']));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_social_on_accredited on public.schools;
create trigger trg_social_on_accredited after update of accredited on public.schools
  for each row execute function public.social_on_accredited();

create or replace function public.social_on_round_finalized()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_season text;
begin
  if NEW.state = 'finalized' and coalesce(OLD.state, '') <> 'finalized'
     and coalesce(NEW.seq, 0) < 900
     and not exists (select 1 from social_posts where source_event = 'round:' || NEW.id) then
    select name into v_season from seasons where id = NEW.season_id;
    insert into social_posts (sort_order, pillar, title, format, platforms, hook, caption, hashtags,
      media_note, on_screen, shot_list, cta_url, needs_consent, status, source_event, media_url)
    values (0, 'Tournament', 'Results are in — Round ' || coalesce(NEW.seq::text, '?'), 'Reel',
      array['Instagram','TikTok','YouTube'],
      'The results are in.',
      'Round ' || coalesce(NEW.seq::text, '') || coalesce(' of ' || v_season, '') || ' is settled — competitors just found out where they placed and earned the next piece of their medallion. Win or lose, the story keeps building. Continue the path.',
      '#tournament #martialarts #reveal #compete #karate #taekwondo #nmao',
      'Screen-record the monthly reveal + a competitor reaction (with consent).',
      'The results are in. -> Add a piece to your story. -> Continue the path.',
      E'1. The reveal playing (0-3s)\n2. A competitor watching (3-6s)\n3. The placement lands (6-9s)\n4. Reaction (9-12s)\n5. A new segment added to the medallion (12-15s)',
      'https://league.nmao.us/?utm_source=social&utm_medium=organic&utm_campaign=results',
      false, 'pending', 'round:' || NEW.id,
      social_pick_brand_media(array['medallion','reveal']));
  end if;
  return NEW;
end $$;
drop trigger if exists trg_social_on_round_finalized on public.rounds;
create trigger trg_social_on_round_finalized after update of state on public.rounds
  for each row execute function public.social_on_round_finalized();
