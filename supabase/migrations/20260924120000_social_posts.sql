-- Mission Control: Social approval queue (2026-09-24).
-- A staff-only queue of short-form posts: generate/queue -> approve -> schedule -> posted.
-- Reads + writes go through SECURITY DEFINER RPCs gated on the staff table, matching
-- the rest of MC. No direct table policies (RLS on, deny-all direct access).

create table if not exists public.social_posts (
  id           uuid primary key default gen_random_uuid(),
  sort_order   int  not null default 0,
  pillar       text,
  title        text,
  format       text,
  platforms    text[] not null default '{}',
  hook         text,
  caption      text,
  hashtags     text,
  media_note   text,
  shot_list    text,
  on_screen    text,
  status       text not null default 'pending'
               check (status in ('pending','approved','scheduled','posted','skipped')),
  scheduled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.social_posts enable row level security;  -- definer RPCs only

create or replace function public.social_posts_list()
returns setof public.social_posts
language sql stable security definer set search_path = public as $$
  select * from public.social_posts
  where exists (select 1 from staff s where s.auth_user_id = auth.uid())
  order by sort_order, created_at;
$$;

-- Insert (p_id null) or merge-edit (p_id set). Only whitelisted fields; status is checked.
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
      (pillar, title, format, platforms, hook, caption, hashtags, media_note, shot_list, on_screen, status, scheduled_at, sort_order)
    values (
      p_patch->>'pillar', p_patch->>'title', p_patch->>'format',
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'platforms') x), '{}'),
      p_patch->>'hook', p_patch->>'caption', p_patch->>'hashtags', p_patch->>'media_note',
      p_patch->>'shot_list', p_patch->>'on_screen',
      coalesce(p_patch->>'status','pending'),
      case when p_patch ? 'scheduled_at' and length(coalesce(p_patch->>'scheduled_at','')) > 0
           then (p_patch->>'scheduled_at')::timestamptz else null end,
      coalesce((p_patch->>'sort_order')::int, 999)
    ) returning * into r;
    return r;
  end if;
  update public.social_posts set
    caption      = coalesce(p_patch->>'caption', caption),
    hook         = coalesce(p_patch->>'hook', hook),
    hashtags     = coalesce(p_patch->>'hashtags', hashtags),
    media_note   = coalesce(p_patch->>'media_note', media_note),
    status       = coalesce(p_patch->>'status', status),
    scheduled_at = case when p_patch ? 'scheduled_at'
                        then nullif(p_patch->>'scheduled_at','')::timestamptz else scheduled_at end,
    updated_at   = now()
  where id = p_id
  returning * into r;
  return r;
end $$;

revoke all on function public.social_posts_list() from public, anon;
revoke all on function public.social_post_save(uuid, jsonb) from public, anon;
grant execute on function public.social_posts_list() to authenticated;
grant execute on function public.social_post_save(uuid, jsonb) to authenticated;

-- Seed the first 10 posts (only if the table is empty).
insert into public.social_posts (sort_order, pillar, title, format, platforms, hook, caption, hashtags, media_note, on_screen, shot_list)
select * from (values
 (1,'Values','Assembling the Medallion','Reel',array['Instagram','TikTok','YouTube'],
  'You don''t win this. You build it.',
  'The NMAO medallion isn''t handed to you — it''s earned one piece, one effort at a time. Every round adds a segment to your story. Win or lose, you leave with something real. Continue the path.',
  '#martialarts #karate #taekwondo #discipline #medal #youthsports #nmao #continuethepath',
  'Medallion assembling segment by segment (existing renders/photos).',
  'You don''t win this. -> You build it. -> One piece, one effort at a time. -> Continue the path.',
  E'1. Close on the empty holder/backing, dark surface (0-2s)\n2. One segment clicks into place (2-4s)\n3. Quick cuts: more segments fill the circle (4-9s)\n4. The keystone drops in - full medallion (9-12s)\n5. Hold on the finished piece, slow push-in (12-15s)'),
 (2,'Student Wins','Almost Didn''t Compete','Reel',array['Instagram','TikTok','YouTube'],
  'She almost didn''t step on the mat.',
  'Courage isn''t the absence of fear — it''s showing up anyway. Every competitor who steps on the mat has already won the hardest match. Humble in victory, unbroken in defeat.',
  '#martialartskids #confidence #youthsports #karate #taekwondo #bravery #nmao',
  'Real competitor entry clip (guardian consent / approved footage only).',
  'She almost didn''t compete. -> She stepped up anyway. -> That''s the win.',
  E'1. Nervous competitor on the sideline, hands fidgeting (0-3s)\n2. A breath, a nod - stepping forward (3-5s)\n3. The performance, full effort (5-11s)\n4. The finish - relief, a small smile (11-14s)\n5. Freeze on the smile (14-15s)'),
 (3,'Technique','Fix This in 15 Seconds','Short',array['TikTok','YouTube'],
  'One detail most people miss.',
  'Small fix, big difference. Save this and drill it 10 reps a day this week — slow before fast. Which one are you working on? Continue the path.',
  '#karatetraining #martialartstips #technique #kata #forms #martialarts #nmao',
  'Instructor demo, tight framing, on-screen checkpoints.',
  'The mistake -> The fix -> Drill it this week.',
  E'1. Instructor shows the common mistake, slow (0-4s)\n2. On-screen X over the mistake (4-5s)\n3. The fix, same move done right (5-11s)\n4. Side-by-side wrong vs right (11-14s)\n5. Point to camera: your turn (14-15s)'),
 (4,'School Spotlight','This Dojo Earned the Seal','Reel',array['Instagram','TikTok','YouTube'],
  'This school is NMAO-accredited.',
  'Meet [School Name] — an NMAO-accredited school raising the standard for how martial arts is taught. Accreditation means their integrity is independently verified, and we love shouting it out. Find accredited schools in the directory. Link in bio.',
  '#martialartsschool #accredited #dojo #karate #taekwondo #martialarts #nmao',
  '3-5 short vertical clips from the school + the NMAO seal graphic. Accredited schools only; rotate weekly.',
  '[School Name] -> Accredited by NMAO -> Verified integrity -> Find them in the directory.',
  E'1. School exterior/interior, the NMAO seal on the wall (0-3s)\n2. A class in motion, focused (3-8s)\n3. A founder/instructor line to camera (8-12s)\n4. Students bowing out together (12-14s)\n5. End card: Accredited by NMAO + directory (14-15s)'),
 (5,'Tournament','The Results Are In','Reel',array['Instagram','TikTok','YouTube'],
  'The reveal never gets old.',
  'Every month, competitors find out where they placed — and earn the next piece of their medallion. Win or lose, the story keeps building. That''s the league. Continue the path.',
  '#tournament #martialarts #reveal #karate #taekwondo #compete #nmao',
  'Monthly reveal screen-capture + a real reaction clip (consented).',
  'Every month... -> The results are in. -> Add a piece to your story.',
  E'1. Phone screen: the monthly reveal starting (0-3s)\n2. A competitor watching, anticipation (3-6s)\n3. The placement lands on screen (6-9s)\n4. Reaction - a fist pump, a grin (9-12s)\n5. A new segment added to their medallion (12-15s)'),
 (6,'Values','The Scoreboard Forgets','Reel',array['Instagram','TikTok','YouTube'],
  'The scoreboard forgets. The habits don''t.',
  'Trophies gather dust. Discipline compounds. You are defined not by victories or defeats, but by your dedication to improve — one rep at a time. Continue the path.',
  '#mindset #discipline #martialarts #karate #motivation #growth #nmao',
  'A quiet training montage (any school). Slow, cinematic; let the text carry it.',
  'The scoreboard forgets. -> The habits don''t. -> You are defined by your dedication, not your record.',
  E'1. Empty dojo at dawn, one student arriving early (0-3s)\n2. Reps - the same drill, again and again (3-9s)\n3. Sweat, focus, no audience (9-12s)\n4. They bow out alone (12-15s)'),
 (7,'Tournament','Everyone Leaves With a Piece','Reel',array['Instagram','TikTok','YouTube'],
  'Top 3 get plated. Everyone earns a piece.',
  'In our league, the top three earn a plated podium piece — and everyone else earns their participation piece. Because stepping up and competing is already a win worth keeping. Earned, one piece, one effort at a time.',
  '#youthmartialarts #participation #medal #karate #taekwondo #compete #nmao',
  'Medallion pieces (gold/silver/bronze plated + participation) - vendor sample photos.',
  'Podium earns plated. -> Everyone earns a piece. -> Because showing up is already a win.',
  E'1. The plated podium segments catching light (0-4s)\n2. The participation piece, just as proudly held (4-7s)\n3. Wide of many kids, each holding a piece (7-11s)\n4. Two hands snap a segment onto a holder (11-14s)\n5. End on the full medallion (14-15s)'),
 (8,'Technique','Three Checkpoints, Cleaner Kick','Short',array['TikTok','YouTube'],
  'Chamber. Extend. Re-chamber.',
  'Three checkpoints for a cleaner front kick: chamber, extend, re-chamber. Drill it slow before you drill it fast — control first, speed follows. Save this for practice.',
  '#karate #kicks #martialartstraining #technique #taekwondo #martialarts #nmao',
  'Slow-mo instructor demo with on-screen checkpoint labels.',
  '1. Chamber -> 2. Extend -> 3. Re-chamber -> Slow before fast.',
  E'1. Full-speed front kick, then freeze (0-3s)\n2. Slow-mo, checkpoint 1 - chamber (3-6s)\n3. Checkpoint 2 - full extension (6-9s)\n4. Checkpoint 3 - re-chamber (9-12s)\n5. Full-speed again, now clean (12-15s)'),
 (9,'Transformation','White Belt to Today','Reel',array['Instagram','TikTok'],
  'White belt, day one.',
  'Two years of small efforts, stacked. This is what the path looks like — one class, one rep, one round at a time. Every black belt was once a beginner who refused to quit. Continue the path.',
  '#transformation #beltjourney #martialarts #karate #taekwondo #progress #nmao',
  'Before/after clips of one student (with consent). Ask accredited schools for then-and-now footage.',
  'White belt, day one. -> [X] years of small efforts. -> This is the path.',
  E'1. Old clip: nervous white belt, shaky first form (0-4s)\n2. Transition wipe on a punch or kick (4-5s)\n3. Today: same student, sharp and confident (5-11s)\n4. Split-screen then vs now (11-14s)\n5. They tie their belt, look to camera (14-15s)'),
 (10,'Brand','The League We Wished Existed','Reel',array['Instagram','TikTok','YouTube'],
  'So we built the league we wished existed.',
  'We made the league we wished existed — built on integrity, where every competitor, win or lose, leaves with something they earned. Accredited schools, real judging, a medallion you build one effort at a time. This is NMAO. Continue the path.',
  '#martialarts #league #compete #karate #taekwondo #integrity #nmao #continuethepath',
  'Founder piece-to-camera + best-of b-roll. The dragon crest on the end card.',
  'Built on integrity. -> Every competitor leaves with something earned. -> This is NMAO.',
  E'1. Founder to camera, plain and direct (0-4s)\n2. B-roll: kids competing, a reveal, a medallion (4-10s)\n3. Back to founder for the closing line (10-13s)\n4. End card: NMAO dragon + Continue the path. (13-15s)')
) as t(sort_order, pillar, title, format, platforms, hook, caption, hashtags, media_note, on_screen, shot_list)
where not exists (select 1 from public.social_posts limit 1);
