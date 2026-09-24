-- Weekly auto-fill for the Social queue (2026-09-24): every Monday 06:00 UTC,
-- generate 5 fresh on-brand DRAFTS (status 'pending') so the approval queue is
-- never empty. Authenticates with the vault cron secret (matches the EF's
-- CRON_SECRET); the EF only ever creates pending drafts — it never publishes.
select cron.schedule('social-weekly-fill', '0 6 * * 1', $cron$
  select net.http_post(
    url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/social-generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
    ),
    body := '{"count":5}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
