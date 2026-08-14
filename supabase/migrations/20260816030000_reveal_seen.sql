-- ============================================================
-- App-support: mark a monthly reveal seen (spec §8b close → flip seen).
-- The client has SELECT-only on monthly_reveals, so a definer RPC flips it.
-- ============================================================

create or replace function public.mark_monthly_reveal_seen(p_period text)
returns void language sql security definer set search_path = public as $$
  update monthly_reveals set seen = true
  where period = p_period and competitor_id in (select nmao.competitor_ids());
$$;
revoke all on function public.mark_monthly_reveal_seen(text) from public;
grant execute on function public.mark_monthly_reveal_seen(text) to authenticated;
