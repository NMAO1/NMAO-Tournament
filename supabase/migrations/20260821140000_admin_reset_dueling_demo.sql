-- ============================================================
-- admin_reset_dueling_demo — one-tap reset of the Compete-app dueling demo,
-- so an operator can re-run the walkthrough (monthly reveal + vote queue +
-- notifications) from Mission Control without touching the DB by hand.
-- Staff-only. Defaults to the demo competitor (Ava Kim / test-competitor).
--   1) monthly_reveals.seen -> false  (the reveal auto-plays again on next open)
--   2) notifications.read   -> false  (the bell shows the demo alerts again)
--   3) clears the competitor's votes on OPEN ('voting') duels so all reappear
--      in their vote queue.
-- Does NOT touch rounds — MC's "Create a fresh DEMO round" button handles those.
-- ============================================================
create or replace function public.admin_reset_dueling_demo(
  p_competitor_id uuid default '28bfafdb-fdbb-42f0-8f24-53aebc6929ee'   -- Ava Kim (test-competitor)
) returns jsonb
language plpgsql security definer set search_path = public, nmao as $$
declare
  v_reveals int; v_notifs int; v_votes int;
begin
  if not nmao.is_staff() then raise exception 'staff only'; end if;

  update monthly_reveals set seen = false
    where competitor_id = p_competitor_id and seen = true;
  get diagnostics v_reveals = row_count;

  update notifications set read = false
    where competitor_id = p_competitor_id and read = true;
  get diagnostics v_notifs = row_count;

  delete from duel_votes
    where voter_competitor_id = p_competitor_id
      and duel_id in (select id from duels where status = 'voting');
  get diagnostics v_votes = row_count;

  return jsonb_build_object(
    'ok', true, 'competitor_id', p_competitor_id,
    'reveals_unseen', v_reveals, 'notifications_unread', v_notifs, 'votes_cleared', v_votes
  );
end $$;

revoke all on function public.admin_reset_dueling_demo(uuid) from public, anon;
grant execute on function public.admin_reset_dueling_demo(uuid) to authenticated;
