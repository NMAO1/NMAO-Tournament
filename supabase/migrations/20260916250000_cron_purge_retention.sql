-- CRON: monthly retention purge. Deletes videos for competitors dormant past the
-- retention window (app_settings.retention_months, default 12) — see
-- purge-expired-videos. Runs on the 1st of each month at 04:10 UTC. Auth: shared
-- cron secret as x-cron-secret (same Vault secret + function CRON_SECRET as the
-- other tournament crons). Idempotent (re-run finds no video for a purged cohort).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ declare j bigint; begin
  for j in select jobid from cron.job where jobname = 'purge-expired-videos' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'purge-expired-videos',
  '10 4 1 * *',
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
