-- Brand-media library kind + management RPCs, and the daily analytics cron.

alter table public.social_brand_media add column if not exists kind text not null default 'video'
  check (kind in ('video','image'));

-- auto-attach only ever pulls VIDEO b-roll (Reels/TikTok/Shorts need video)
create or replace function public.social_pick_brand_media(p_tags text[])
returns text language sql stable security definer set search_path = public as $$
  select url from public.social_brand_media
  where kind = 'video' and tags && p_tags
  order by random() limit 1;
$$;

create or replace function public.social_brand_media_list()
returns setof public.social_brand_media
language sql stable security definer set search_path = public as $$
  select * from public.social_brand_media
  where exists (select 1 from staff s where s.auth_user_id = auth.uid())
  order by kind, label;
$$;

create or replace function public.social_brand_media_add(p_label text, p_url text, p_tags text[], p_kind text)
returns public.social_brand_media
language plpgsql security definer set search_path = public as $$
declare r public.social_brand_media;
begin
  if not exists (select 1 from staff s where s.auth_user_id = auth.uid()) then
    raise exception 'staff only' using errcode = '42501';
  end if;
  insert into public.social_brand_media (label, url, tags, kind)
  values (p_label, p_url, coalesce(p_tags,'{}'), coalesce(nullif(p_kind,''),'video'))
  returning * into r;
  return r;
end $$;

revoke all on function public.social_brand_media_list() from public, anon;
revoke all on function public.social_brand_media_add(text, text, text[], text) from public, anon;
grant execute on function public.social_brand_media_list() to authenticated;
grant execute on function public.social_brand_media_add(text, text, text[], text) to authenticated;

-- daily analytics refresh for posted posts (no-ops until AYRSHARE_API_KEY is set)
select cron.schedule('social-analytics-daily', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/social-analytics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 40000
  );
$cron$);
