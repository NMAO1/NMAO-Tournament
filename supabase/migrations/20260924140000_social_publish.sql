-- Social publish plumbing (2026-09-24): media hosting + publish state, ready for
-- the Ayrshare key. Media lives in a public bucket so the posting API can fetch
-- the video; staff upload, everyone reads. Nothing here publishes on its own.

alter table public.social_posts add column if not exists media_url     text;
alter table public.social_posts add column if not exists ayrshare_id   text;
alter table public.social_posts add column if not exists posted_at     timestamptz;
alter table public.social_posts add column if not exists publish_error text;

-- allow a 'failed' status (a publish attempt that errored) alongside the rest
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add  constraint social_posts_status_check
  check (status in ('pending','approved','scheduled','posted','skipped','failed'));

-- public media bucket (public read so the posting API can fetch the file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-media', 'social-media', true, 524288000)   -- 500 MB per file
on conflict (id) do update set public = true, file_size_limit = 524288000;

-- staff may write to the bucket; read is public (bucket.public = true)
drop policy if exists "social media staff write" on storage.objects;
create policy "social media staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and exists (select 1 from public.staff s where s.auth_user_id = auth.uid()));
drop policy if exists "social media staff update" on storage.objects;
create policy "social media staff update" on storage.objects for update to authenticated
  using (bucket_id = 'social-media' and exists (select 1 from public.staff s where s.auth_user_id = auth.uid()));
drop policy if exists "social media staff delete" on storage.objects;
create policy "social media staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'social-media' and exists (select 1 from public.staff s where s.auth_user_id = auth.uid()));

-- extend the save RPC to also accept media_url (still whitelisted, still staff-gated)
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
      (pillar, title, format, platforms, hook, caption, hashtags, media_note, shot_list, on_screen, media_url, status, scheduled_at, sort_order)
    values (
      p_patch->>'pillar', p_patch->>'title', p_patch->>'format',
      coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'platforms') x), '{}'),
      p_patch->>'hook', p_patch->>'caption', p_patch->>'hashtags', p_patch->>'media_note',
      p_patch->>'shot_list', p_patch->>'on_screen', p_patch->>'media_url',
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
    media_url    = case when p_patch ? 'media_url' then nullif(p_patch->>'media_url','') else media_url end,
    status       = coalesce(p_patch->>'status', status),
    scheduled_at = case when p_patch ? 'scheduled_at'
                        then nullif(p_patch->>'scheduled_at','')::timestamptz else scheduled_at end,
    updated_at   = now()
  where id = p_id
  returning * into r;
  return r;
end $$;
revoke all on function public.social_post_save(uuid, jsonb) from public, anon;
grant execute on function public.social_post_save(uuid, jsonb) to authenticated;
