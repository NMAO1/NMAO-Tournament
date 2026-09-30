-- Recently Featured: link NMAO posts to the school they promote + a public read.
-- social_posts.promoted_school_id is now set by social_on_result_win (competitor's
-- school), social_on_accredited (the school), social_harvest_add (v_school_id), and
-- bridge-content-submit (school submissions). growth_featured returns a school's POSTED
-- features (already-public content) for the member-dashboard Growth Engine strip.
alter table public.social_posts add column if not exists promoted_school_id uuid;

create or replace function public.growth_featured(p_school uuid, p_limit int default 8)
returns table (id uuid, title text, caption text, media_url text, platforms text[], posted_at timestamptz, pillar text)
language sql security definer set search_path = public stable as $$
  select id, title, caption, media_url, platforms, posted_at, pillar
  from public.social_posts
  where promoted_school_id = p_school and status = 'posted'
  order by coalesce(posted_at, updated_at) desc
  limit greatest(least(coalesce(p_limit,8), 24), 1);
$$;
grant execute on function public.growth_featured(uuid, int) to anon, authenticated;
-- (social_on_result_win / social_on_accredited / social_harvest_add were also updated
--  to write promoted_school_id — full bodies live in the DB; applied 2026-09-30.)
