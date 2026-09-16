-- CRON: sweep accrued-but-unpaid school payouts. When a school finishes Stripe
-- Connect onboarding after entries/passes already accrued 'pending' payout rows,
-- the webhook never revisits them — this pays them out. Idempotent (the EF reuses
-- the webhook's per-entry idempotency key and re-checks status before paying).
-- Runs every 6 hours. Auth: shared cron secret as x-cron-secret (same Vault
-- secret + function CRON_SECRET as the other tournament crons).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ declare j bigint; begin
  for j in select jobid from cron.job where jobname = 'sweep-school-payouts' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'sweep-school-payouts',
  '0 */6 * * *',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/sweep-school-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
