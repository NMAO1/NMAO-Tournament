-- Soft-open automation fix (2026-09-23): several legacy cron rows still send a stale
-- hardcoded x-cron-secret ('19f596…') and get 403'd by their EFs (which check the
-- vault-backed CRON_SECRET). Repoint the ones we keep to the vault secret (matching
-- the healthy crons), and unschedule the duplicates already superseded by vault twins.

-- Repoint: fill-unclaimed-deadline (judging safety-net), judge-headsup, partner-pay-weekly.
do $$
declare r record;
begin
  for r in select jobid, command from cron.job
           where jobname in ('fill-unclaimed-deadline', 'judge-headsup', 'partner-pay-weekly')
             and command like '%19f596c854014934963f4c357d64b9bf%'
  loop
    perform cron.alter_job(r.jobid,
      command => replace(r.command,
        '''19f596c854014934963f4c357d64b9bf''',
        '(select decrypted_secret from vault.decrypted_secrets where name = ''tournament_cron_secret'')'));
  end loop;
end $$;

-- Unschedule legacy duplicates (resolve-referrals / partner-accrue-weekly /
-- partner-accrue-school-monthly) — each already done by a vault-secret twin.
do $$
declare r record;
begin
  for r in select jobid from cron.job
           where jobname in ('resolve-referrals', 'partner-accrue-weekly', 'partner-accrue-school-monthly')
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;
