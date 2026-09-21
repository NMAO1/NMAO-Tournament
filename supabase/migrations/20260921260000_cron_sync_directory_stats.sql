-- CRON: directory flywheel. sync-directory-tournament-stats reads per-school
-- tournament signals (directory_school_stats) and writes competitor counts +
-- "active this season" onto the matching Membership directory_listings, so each
-- listing shows live NMAO League activity. Nightly is plenty.
--
-- Auth: shared cron secret as x-cron-secret (Vault 'tournament_cron_secret' +
-- function CRON_SECRET). Idempotent (unschedule-then-schedule by name).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'sync-directory-tournament-stats' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'sync-directory-tournament-stats',
  '30 6 * * *',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/sync-directory-tournament-stats',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
