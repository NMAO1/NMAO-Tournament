-- =====================================================================
-- CRON: auto-run the judging safety-net (hands-off deadline enforcement).
-- Every 30 min it POSTs to fill-unclaimed-pods in AUTO mode ({} body), which
-- backfills every round whose judging_deadline has passed and still has
-- unclaimed pods. No button, no waiting.
--
-- ── SETUP (do first) ─────────────────────────────────────────────────
--   1. Pick a secret value. Easiest: run   select gen_random_uuid();
--   2. Dashboard → Edge Functions → fill-unclaimed-pods → Secrets/Env →
--        add   CRON_SECRET = <that value>     (the function checks this)
--   3. Replace <SECRET> in TWO spots below with the SAME value, run this script.
-- ─────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the secret in Vault (so it isn't hard-coded in the cron command/logs).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'tournament_cron_secret') then
    perform vault.create_secret('<SECRET>', 'tournament_cron_secret');
  end if;
end $$;

-- Replace any prior copy of this job, then (re)schedule it.
do $$
declare j bigint;
begin
  for j in select jobid from cron.job where jobname = 'fill-unclaimed-deadline' loop
    perform cron.unschedule(j);
  end loop;
end $$;

select cron.schedule(
  'fill-unclaimed-deadline',
  '*/30 * * * *',
  $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/fill-unclaimed-pods',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- Verify it's scheduled:
select jobname, schedule, active from cron.job where jobname = 'fill-unclaimed-deadline';
