-- =====================================================================
-- CRON: auto-run the ambassador referral resolver so a school that signs up
-- under an ambassador's ?p=<slug> link is attributed to that ambassador
-- AUTOMATICALLY (every 15 min) — not only when staff click "Resolve referral
-- links" in Mission Control. resolve-referral-attributions is idempotent and
-- first-touch-locked, so re-running is safe.
--
-- Auth: posts the shared cron secret as x-cron-secret. Reuses the SAME Vault
-- secret + function CRON_SECRET as the judging safety-net cron
-- (seed_cron_autofill.sql). If that safety-net cron runs, this one does too.
-- Idempotent (unschedule-then-schedule by name).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'resolve-referral-attributions' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'resolve-referral-attributions',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/resolve-referral-attributions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
