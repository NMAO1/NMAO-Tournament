-- B3 (pre-submission audit): the 'profile-photos' bucket was created public=true
-- (20260816000000). It is meant to hold photos of MINORS, so unauthenticated
-- public URLs are inappropriate. The feature is currently dormant (no in-app
-- upload path; 0 competitors have profile_photo_url set), so flipping it private
-- now is pure hardening with zero functional impact.
--
-- NOTE: when a profile-photo upload feature is actually built, it must serve
-- images via SIGNED URLs (like entry-videos via get-playback-url), not public
-- object URLs — the surfaces that read competitors.profile_photo_url
-- (duel_vote_queue, duel_faceoff, competitor_card, app/lib/profile.ts) will then
-- need to resolve a signed URL rather than a raw public one.

update storage.buckets set public = false where id = 'profile-photos';
