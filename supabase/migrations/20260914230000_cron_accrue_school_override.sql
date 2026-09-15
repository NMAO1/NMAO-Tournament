-- =====================================================================
-- CRON: auto-accrue the ambassador 10% SCHOOL OVERRIDE (10% of each attributed
-- school's 1% membership platform fee, capped $20/school/month). Runs WEEKLY
-- (Mondays 05:00 UTC) rather than strictly monthly because the function also
-- RECONCILES the last 3 months on every run (late-refund true-ups + clawbacks)
-- and picks up schools attributed after the first accrual — so a weekly cadence
-- keeps pending amounts accurate for whenever pay-partners is run (manual).
-- Idempotent; gated by app_settings.partner_school_override_enabled (now ON).
-- No money moves here — pay-partners still sends the Stripe transfers.
--
-- Auth: x-cron-secret from the shared Vault secret (same pattern as the other
-- tournament crons). Idempotent (unschedule-then-schedule by name).
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'accrue-partner-school-payouts' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'accrue-partner-school-payouts',
  '0 5 * * 1',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/accrue-partner-school-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
