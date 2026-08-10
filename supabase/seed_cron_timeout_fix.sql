-- =====================================================================
-- pg_net's default 5s timeout trips on the function's cold start. Raise it to
-- 20s, reschedule the job, and fire one test call now.
-- After running, wait ~10s then run the response check (bottom) — expect 200.
-- =====================================================================
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
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);

-- fire one now to test (cold start may take several seconds):
select net.http_post(
  url := 'https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/fill-unclaimed-pods',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tournament_cron_secret')
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 20000
);

-- ...wait ~10 seconds, then run THIS on its own to see the result:
-- select status_code, left(content,150) as content from net._http_response order by created desc limit 1;
