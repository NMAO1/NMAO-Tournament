-- ============================================================================
-- Security lockdown — close anon write/exec surfaces (state-of-app audit 2026-09-06)
--
-- Two independently-safe changes, both verified against the live schema:
--
--   PART A — 4 tables had RLS DISABLED and full GRANT ALL to anon+authenticated.
--     They are written ONLY by cron / service-role / SECURITY DEFINER functions
--     (verified: zero direct .from() reads in app/, web/, or edge functions).
--     The sharp one is duel_reveal_messages: its text is displayed to children
--     during duel reveals, so anon write = inappropriate-content injection.
--     Fix: enable RLS (no policy = deny-all to anon/authenticated) + revoke grants.
--     Definer functions (run as owner) and service_role bypass RLS, so all
--     legitimate access is unaffected. NOTE: plain ENABLE (not FORCE) RLS, so the
--     table owner / definer functions are intentionally not subject to the policy.
--
--   PART B — 44 privileged SECURITY DEFINER functions (admin_* + 3 cron writers)
--     still grant EXECUTE to anon (the public key). Internal is_staff()/ownership
--     gates hold today, but this is defense-in-depth: lock exec to the roles that
--     actually call them. admin_* -> authenticated (staff, gated internally) +
--     service_role; the cron writers -> service_role only (called by pay-judges /
--     round-controller EFs). Re-runnable / idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART A: lock the four anon-writable tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'duel_reveal_messages',   -- text shown to minors during reveals
    'dueling_award_config',   -- badge/award tuning constants (award engine reads via admin_award_config)
    'rank_history',           -- leaderboard rank snapshots (read via definer leaderboard RPCs)
    'judge_headsup_log'       -- cron notify log
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PART B1: admin_* functions -> authenticated (staff, internally gated) + service_role, NOT anon
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select n.nspname as s, p.proname as f, pg_get_function_identity_arguments(p.oid) as a
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','nmao') and p.proname ~ '^admin_'
  loop
    execute format('revoke execute on function %I.%I(%s) from public, anon', r.s, r.f, r.a);
    execute format('grant execute on function %I.%I(%s) to authenticated, service_role', r.s, r.f, r.a);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PART B2: cron/service writers -> service_role only (called by service-role EFs / pg_cron)
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select n.nspname as s, p.proname as f, pg_get_function_identity_arguments(p.oid) as a
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','nmao')
      and p.proname in ('record_round_judge_payments','snapshot_leaderboard_ranks','recompute_badges_after_round')
  loop
    execute format('revoke execute on function %I.%I(%s) from public, anon, authenticated', r.s, r.f, r.a);
    execute format('grant execute on function %I.%I(%s) to service_role', r.s, r.f, r.a);
  end loop;
end $$;

-- ============================================================================
-- Post-deploy verification (run manually; all should return 0 rows / false):
--
--   -- tables now RLS-on and no anon/authenticated grants:
--   select relname, relrowsecurity from pg_class
--   where relname in ('duel_reveal_messages','dueling_award_config','rank_history','judge_headsup_log');
--
--   -- no admin_* or writer still anon-executable:
--   select n.nspname||'.'||p.proname
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname in ('public','nmao')
--     and (p.proname ~ '^admin_' or p.proname in
--          ('record_round_judge_payments','snapshot_leaderboard_ranks','recompute_badges_after_round'))
--     and has_function_privilege('anon', p.oid, 'EXECUTE');
-- ============================================================================
