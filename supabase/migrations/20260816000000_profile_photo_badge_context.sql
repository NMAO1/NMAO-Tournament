-- ============================================================
-- App-support gaps G9 + G8 (spec: APP-WIRING-SPEC.md §8/§9)
--   G9  competitors.profile_photo_url + a public 'profile-photos' storage bucket.
--       Powers the face-off / reveal / duel-page portrait (silhouette fallback when null).
--   G8  badge_awards.context jsonb — the concrete EARNED-ACTION for a badge award
--       (opponent name(s), vote %, dates, streak members). Shown under each collectible.
--       Column added now; award functions populate it going forward, reveal reads it.
-- ============================================================

alter table competitors add column if not exists profile_photo_url text;
alter table badge_awards add column if not exists context jsonb;

-- public bucket for profile bust shots (readable by the app; uploads gated app-side)
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;
