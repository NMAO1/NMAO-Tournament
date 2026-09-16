-- B3 (pre-submission COPPA hardening): the profile-photos bucket held minors'
-- profile images on a PUBLIC (unauthenticated) URL path. Close it. Currently 0
-- photos exist, so nothing breaks today; when profile-photo upload is built it
-- must serve via signed URLs (mirror get-playback-url for entry-videos).
update storage.buckets set public = false where id = 'profile-photos';
