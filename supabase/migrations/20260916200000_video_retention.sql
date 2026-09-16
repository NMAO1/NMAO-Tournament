-- Video retention (COPPA §312.10 + media-release §4 / privacy.html). Competition
-- and duel videos are kept while the account is ACTIVE, plus 12 months — i.e.
-- purged only once the account has been inactive for the retention window. The
-- purge itself runs in the purge-expired-videos Edge Function; this migration
-- provides the resolver + the tunable settings.
--
-- ANCHOR (Brad, 2026-09-16): per-account inactivity. "Activity" = the latest of
-- the competitor's entries, duels, the guardian login's last sign-in, and the
-- competitor's own login (if any). Deleted accounts are already purged by
-- delete-account, so they're excluded.

-- Tunables (key/value app_settings). Dry-run defaults TRUE so the first cycles
-- only LOG what they would delete — flip to false to enable real deletion.
insert into app_settings (key, value) values ('video_retention_months', '12'::jsonb) on conflict (key) do nothing;
insert into app_settings (key, value) values ('video_retention_dry_run', 'true'::jsonb) on conflict (key) do nothing;

-- Competitors whose account has been inactive for >= p_months. SECURITY DEFINER
-- because it reads auth.users.last_sign_in_at; public so the EF can rpc() it.
create or replace function public.inactive_competitors(p_months int default 12)
returns table (competitor_id uuid, last_activity timestamptz)
language sql stable security definer set search_path = public as $$
  with act as (
    select c.id as cid,
      greatest(
        coalesce((select max(e.created_at) from entries e where e.competitor_id = c.id), 'epoch'::timestamptz),
        coalesce((select max(d.created_at) from duels d where d.challenger_id = c.id or d.opponent_id = c.id), 'epoch'::timestamptz),
        coalesce((select max(u.last_sign_in_at) from guardian_competitors gc
                    join guardians g on g.id = gc.guardian_id
                    join auth.users u on u.id = g.auth_user_id
                  where gc.competitor_id = c.id), 'epoch'::timestamptz),
        coalesce((select max(u.last_sign_in_at) from auth.users u where u.id = c.auth_user_id), 'epoch'::timestamptz)
      ) as last_activity
    from competitors c
    where coalesce(c.status, '') <> 'deleted'
  )
  select cid, last_activity from act
  where last_activity < now() - make_interval(months => greatest(p_months, 1));
$$;

revoke all on function public.inactive_competitors(int) from public, anon, authenticated;
grant execute on function public.inactive_competitors(int) to service_role;
