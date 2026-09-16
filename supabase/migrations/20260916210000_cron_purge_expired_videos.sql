-- CRON: retention purge for minors' competition + duel videos. purge-expired-videos
-- deletes videos for competitors whose account has been inactive for the retention
-- window (default 12 months). Weekly is plenty. SAFE by default: the function runs
-- in DRY-RUN (app_settings.video_retention_dry_run=true) until that flag is set
-- false, so these first cycles only LOG what they would delete.
--
-- Auth: shared cron secret as x-cron-secret (Vault 'tournament_cron_secret' +
-- function CRON_SECRET). Idempotent (unschedule-then-schedule by name).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'purge-expired-videos' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'purge-expired-videos',
  '0 7 * * 0',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/purge-expired-videos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
