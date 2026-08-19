-- Hardening: the sponsor buckets were created public with NO size/type limits,
-- so an upload URL could push arbitrarily large or arbitrary-type files. Cap them.
update storage.buckets
  set file_size_limit = 62914560,  -- 60 MB (matches the client-side ad-video cap)
      allowed_mime_types = array['video/mp4','video/quicktime','video/webm']
  where id = 'sponsor-videos';

update storage.buckets
  set file_size_limit = 5242880,   -- 5 MB
      allowed_mime_types = array['image/png','image/jpeg','image/jpg','image/webp','image/gif']
  where id = 'sponsor-assets';
