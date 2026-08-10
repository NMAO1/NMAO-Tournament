-- =====================================================================
-- Set a real cron secret (the earlier run stored the literal '<SECRET>').
-- This regenerates it, stores it in Vault, and PRINTS it so you can paste the
-- value into the function's env var.
--
-- After running: Dashboard → Edge Functions → fill-unclaimed-pods → Secrets →
--   CRON_SECRET = <the value shown below>
-- (The cron already reads from Vault, so nothing else to change.)
-- =====================================================================
do $$
declare v_id uuid; v_secret text := gen_random_uuid()::text;
begin
  select id into v_id from vault.secrets where name = 'tournament_cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secret, 'tournament_cron_secret');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;
end $$;

select decrypted_secret as copy_into_CRON_SECRET_env
from vault.decrypted_secrets where name = 'tournament_cron_secret';
