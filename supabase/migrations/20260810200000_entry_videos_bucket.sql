-- =====================================================================
-- entry-videos storage bucket (PRIVATE) + competitor-scoped RLS.
--
-- Competitors upload their 1–2 angle videos here under their own
-- <competitor_id>/... folder. The bucket is PRIVATE (COPPA / minors) — judges
-- and staff never read it directly; they view via short-lived signed URLs
-- minted by the get-playback-url edge function (service role), which is why
-- there is no judge/staff read policy on storage.objects here.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entry-videos', 'entry-videos', false, 524288000,  -- 500 MB
        array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- A competitor (or their guardian) may upload / read / replace / remove files
-- ONLY under a folder named for one of their own competitor ids.
create policy "entry_videos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'entry-videos'
              and (storage.foldername(name))[1]::uuid in (select nmao.competitor_ids()));

create policy "entry_videos_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'entry-videos'
         and (storage.foldername(name))[1]::uuid in (select nmao.competitor_ids()));

create policy "entry_videos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'entry-videos'
         and (storage.foldername(name))[1]::uuid in (select nmao.competitor_ids()));

create policy "entry_videos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'entry-videos'
         and (storage.foldername(name))[1]::uuid in (select nmao.competitor_ids()));
