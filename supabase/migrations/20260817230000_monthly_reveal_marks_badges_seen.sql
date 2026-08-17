-- Reveal-only badges (Honors shows a badge only after it's been revealed, seen=true):
-- the per-tournament reveal already marks its badges seen (markSeen by id), but the
-- MONTHLY reveal previously only flipped the monthly_reveals row — leaving its badges
-- seen=false, so they'd stay hidden in the vault and re-tease every month. Closing the
-- monthly reveal now also lands its badges in the vault by marking the payload's badges
-- seen. Idempotent; scoped to the caller's own competitors.
create or replace function public.mark_monthly_reveal_seen(p_period text)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select competitor_id, payload from monthly_reveals
    where period = p_period and competitor_id in (select nmao.competitor_ids())
  loop
    update monthly_reveals set seen = true
      where competitor_id = r.competitor_id and period = p_period;
    -- Mark the exact badges shown in this reveal (code + tier) as seen.
    update badge_awards ba set seen = true
      where ba.competitor_id = r.competitor_id and ba.seen = false
        and exists (
          select 1 from jsonb_array_elements(coalesce(r.payload -> 'badges', '[]'::jsonb)) e
          where e ->> 'code' = ba.badge_code
            and (e ->> 'tier') is not distinct from ba.tier
        );
  end loop;
end $$;
revoke all on function public.mark_monthly_reveal_seen(text) from public;
grant execute on function public.mark_monthly_reveal_seen(text) to authenticated;
