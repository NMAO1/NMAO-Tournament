-- =====================================================================
-- Clean reset of the cron secret. Removes any placeholder/duplicate copies,
-- creates ONE fresh secret with no hyphens (easy to copy exactly), reveals it.
-- Then set the function env CRON_SECRET to the shown value.
-- =====================================================================
delete from vault.secrets where name = 'tournament_cron_secret';

select vault.create_secret(replace(gen_random_uuid()::text, '-', ''), 'tournament_cron_secret');

select decrypted_secret as copy_into_CRON_SECRET_env
from vault.decrypted_secrets where name = 'tournament_cron_secret';
