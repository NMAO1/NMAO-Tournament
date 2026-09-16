-- Video/data retention (COPPA §312.10 + the counsel-approved media-release/privacy
-- promise: kept "while the account is active, plus twelve months"). Anchored on
-- ACCOUNT INACTIVITY, not per-entry: a competitor's videos are purged once the
-- account has been dormant for the retention window — no paid entry, no duel, and
-- no login (own or guardian) in that time. This keeps an actively-competing
-- family's progress archive intact while purging abandoned minors' footage.
--
-- Config-driven window (app_settings.retention_months, default 12). Nothing ages
-- out until ~a year after launch, so this sits dormant until then.

insert into public.app_settings (key, value)
values ('retention_months', to_jsonb(12))
on conflict (key) do nothing;

-- Competitors dormant past p_months, that still have video to purge. last_active
-- = the most recent of: any entry (paid_at/created_at), any duel they were in,
-- their own login, or any linked guardian's login.
create or replace function nmao.competitors_past_retention(p_months int default 12)
returns table (competitor_id uuid, last_active timestamptz)
language sql stable security definer set search_path = public, auth as $$
  with act as (
    select c.id as cid,
      greatest(
        coalesce((select max(coalesce(e.paid_at, e.created_at)) from public.entries e where e.competitor_id = c.id), 'epoch'::timestamptz),
        coalesce((select max(d.created_at) from public.duels d where d.challenger_id = c.id or d.opponent_id = c.id), 'epoch'::timestamptz),
        coalesce((select max(u.last_sign_in_at) from auth.users u where u.id = c.auth_user_id), 'epoch'::timestamptz),
        coalesce((select max(u.last_sign_in_at)
                    from auth.users u
                    join public.guardians g on g.auth_user_id = u.id
                    join public.guardian_competitors gc on gc.guardian_id = g.id
                   where gc.competitor_id = c.id), 'epoch'::timestamptz)
      ) as last_active
    from public.competitors c
    where c.status <> 'deleted'
      and (
        exists (select 1 from public.entries e
                 where e.competitor_id = c.id and (e.video_url is not null or e.video_url_2 is not null))
        or exists (select 1 from public.duels d
                    where (d.challenger_id = c.id and d.challenger_video is not null)
                       or (d.opponent_id  = c.id and d.opponent_video  is not null))
      )
  )
  select cid, last_active
  from act
  where last_active < (now() - make_interval(months => greatest(p_months, 1)))
  order by last_active
  limit 500;  -- safety cap per run
$$;

revoke all on function nmao.competitors_past_retention(int) from public, anon, authenticated;
grant execute on function nmao.competitors_past_retention(int) to service_role;
