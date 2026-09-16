-- CRON: sweep accrued-but-unpaid school payouts. When a school's athletes pay
-- entries BEFORE the school finishes Stripe Connect onboarding, stripe-webhook
-- writes school_payouts rows as 'pending' and never retries — so the school is
-- silently underpaid once it connects. sweep-school-payouts pays those rows out
-- (idempotent; verifies the account has transfers enabled + the purchase wasn't
-- refunded). Daily is plenty — pending rows are the exception, not the norm.
--
-- Auth: posts the shared cron secret as x-cron-secret (Vault 'tournament_cron_secret'
-- + function CRON_SECRET), same as the other tournament crons. Idempotent
-- (unschedule-then-schedule by name).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'sweep-school-payouts' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'sweep-school-payouts',
  '30 6 * * *',
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
