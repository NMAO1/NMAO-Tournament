-- =====================================================================
-- CRON: auto-accrue ambassador ENTRY payouts ($1 per paid tournament entry at
-- an attributed+bridged school). Runs hourly so pending payout rows build up on
-- their own instead of only when staff click "Accrue entries" in Mission Control.
-- accrue-partner-payouts is idempotent (upsert on entry_id), so re-running is safe.
-- No money moves here — pay-partners still sends the Stripe transfers.
--
-- Auth: posts the shared cron secret as x-cron-secret (same Vault secret +
-- function CRON_SECRET as the other tournament crons). Idempotent (unschedule
-- -then-schedule by name).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'accrue-partner-payouts' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'accrue-partner-payouts',
  '0 * * * *',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/accrue-partner-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
