-- ============================================================
--  Sponsor ad layer for the dueling Arena.
--
--  A short sponsor video plays as an interstitial BETWEEN the Tale of the
--  Path (the fight-card face-off) and the voting ring. This is the ad
--  surface: staff/partnerships load sponsor clips here, one is picked
--  (weighted-random) per duel view, shown for a few seconds with a Skip,
--  and its impression is counted so sponsors get proof of views.
--
--  Storage: clips live in a PUBLIC `sponsor-videos` bucket (no signing —
--  ads aren't secret), or video_url can be any hosted MP4/CDN URL.
--
--  The app calls two public SECURITY DEFINER RPCs:
--    duel_sponsor()               -> one active sponsor (or no row)
--    duel_sponsor_impression(id)  -> bump the view counter
--  Sponsors are MANAGED by staff (service role / Mission Control); no
--  competitor ever writes the table directly.
-- ============================================================

create table if not exists public.duel_sponsors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                       -- sponsor / brand name
  tagline      text,                                -- short line under the name
  video_url    text not null,                       -- public MP4/CDN URL (or sponsor-videos public URL)
  click_url    text,                                -- optional tap-through (opened in browser)
  weight       int  not null default 1 check (weight >= 0),  -- relative frequency (0 = never)
  min_seconds  int  not null default 3 check (min_seconds >= 0), -- seconds before Skip unlocks
  active       boolean not null default true,
  impressions  bigint  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.duel_sponsors is
  'Sponsor ad clips shown between the Tale of the Path and the Arena vote. Staff-managed; served via duel_sponsor().';

alter table public.duel_sponsors enable row level security;
-- No app-facing policies: reads/writes go exclusively through the SECURITY
-- DEFINER RPCs below (app) and the service role (staff/Mission Control).

-- A public home for sponsor clips (public = playable without signed URLs).
insert into storage.buckets (id, name, public)
values ('sponsor-videos', 'sponsor-videos', true)
on conflict (id) do nothing;

-- ---- weighted-random pick of one active sponsor -----------------------------
-- Higher `weight` => proportionally more likely. weight 0 or inactive => never.
-- Returns zero rows when there's nothing to show, so the app skips the ad.
create or replace function public.duel_sponsor()
returns table (id uuid, name text, tagline text, video_url text, click_url text, min_seconds int)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.tagline, s.video_url, s.click_url, s.min_seconds
  from public.duel_sponsors s
  where s.active and s.weight > 0 and coalesce(s.video_url, '') <> ''
  -- exponential-of-uniform keyed by weight = correct weighted sampling
  order by -ln(random()) / s.weight
  limit 1;
$$;

-- ---- count a view -----------------------------------------------------------
create or replace function public.duel_sponsor_impression(p_id uuid)
returns void
language sql volatile security definer set search_path = public as $$
  update public.duel_sponsors set impressions = impressions + 1 where id = p_id;
$$;

revoke all on function public.duel_sponsor() from public;
revoke all on function public.duel_sponsor_impression(uuid) from public;
grant execute on function public.duel_sponsor() to anon, authenticated;
grant execute on function public.duel_sponsor_impression(uuid) to anon, authenticated;
