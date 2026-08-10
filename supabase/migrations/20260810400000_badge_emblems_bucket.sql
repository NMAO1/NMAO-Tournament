-- =====================================================================
-- badge-emblems storage bucket (PUBLIC) — a home for the illustrated badge art
-- (dragon / tiger-eye / lotus / glory-fist / perfect-season-champion, etc.),
-- keyed by badges.emblem_key. Badge art is not sensitive, so public read via URL:
--   <SUPABASE_URL>/storage/v1/object/public/badge-emblems/<emblem_key>
-- Uploads are done by staff via the dashboard (service role), so no write policy here.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('badge-emblems', 'badge-emblems', true, 10485760,  -- 10 MB
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
