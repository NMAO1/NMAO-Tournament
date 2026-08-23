-- =====================================================================
-- SECURITY: revoke the ungated pick-your-opponent RPC create_duel.
--
-- public.create_duel(challenger, opponent, type) lets a caller hand-pick any
-- active opponent and does NOT enforce dueling_enabled, rank, age bracket, geo,
-- or block lists — all of which request_duel (the live random-mystery
-- matchmaking path the app actually uses) enforces. Left EXECUTE-granted to
-- anon + authenticated, it is a direct win/Elo-farm and pulls dueling-disabled
-- competitors into challenges, defeating the matchmaking redesign.
--
-- Nothing in the app/web/edge functions calls create_duel (verified: only
-- request_duel is used, app/lib/duel.ts:77). Revoke it from client roles;
-- service_role keeps EXECUTE for any admin/Mission-Control use.
-- =====================================================================
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'create_duel' and pronamespace = 'public'::regnamespace
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
