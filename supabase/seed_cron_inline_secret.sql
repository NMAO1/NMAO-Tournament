-- =====================================================================
-- Vault edits weren't sticking, so put the cron secret directly in the cron
-- command (no Vault). Generates a fresh hyphen-free secret, reschedules the job
-- with it baked in, and prints it to paste into the function's CRON_SECRET env.
-- =====================================================================
do $$
declare
  v_secret text := replace(gen_random_uuid()::text, '-', '');
  v_cmd text;
  j bigint;
begin
  for j in select jobid from cron.job where jobname = 'fill-unclaimed-deadline' loop
    perform cron.unschedule(j);
  end loop;

  v_cmd :=
    'select net.http_post('
    || 'url := ''https://oxzuavpyoetchwebdejp.supabase.co/functions/v1/fill-unclaimed-pods'', '
    || 'headers := jsonb_build_object(''Content-Type'',''application/json'',''x-cron-secret'',''' || v_secret || '''), '
    || 'body := ''{}''::jsonb, timeout_milliseconds := 20000);';

  perform cron.schedule('fill-unclaimed-deadline', '*/30 * * * *', v_cmd);

  drop table if exists _cron_secret_out;
  create temp table _cron_secret_out (cron_secret text);
  insert into _cron_secret_out values (v_secret);
end $$;

select cron_secret as copy_into_CRON_SECRET_env from _cron_secret_out;
