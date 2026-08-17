-- Public wrapper so the distribute step (round-controller EF, service_role) can fire
-- badge awards immediately instead of waiting up to 10 min for the cron. The engine
-- lives in schema nmao (not REST-exposed); this SECURITY DEFINER wrapper in public
-- lets the EF call it via db.rpc(). Idempotent — safe to call after every distribute.
create or replace function public.recompute_badges_after_round(p_round uuid default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  -- nmao.recompute_all_badges() is idempotent (award_badge de-dupes) and covers the
  -- entry/medal/exploration engine + dueling. p_round is accepted for a future
  -- round-scoped fast path; today we recompute all (cheap at current roster size).
  return nmao.recompute_all_badges();
end $$;

revoke all on function public.recompute_badges_after_round(uuid) from public;
grant execute on function public.recompute_badges_after_round(uuid) to service_role;
