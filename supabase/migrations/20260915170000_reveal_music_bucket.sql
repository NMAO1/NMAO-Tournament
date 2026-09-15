-- =====================================================================
-- Public storage bucket for the monthly-reveal soundtrack. One track per round
-- (round-1.mp3 … round-9.mp3), streamed by the Compete app during the reveal
-- ceremony (kept OUT of the app bundle to hold app size down). Public read via
-- the /object/public/ URL; uploads are service-role (CLI) only. Idempotent.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reveal-music', 'reveal-music', true, 10485760, array['audio/mpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
