-- Keep the pre-brand source so re-branding a post never double-brands.
-- brand-video sets media_original = original on first brand, then points media_url
-- at the branded clip; subsequent brands read media_original.
alter table public.social_posts add column if not exists media_original text;
