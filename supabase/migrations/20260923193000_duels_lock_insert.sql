-- SECURITY (2026-09-23, soft-open sweep): lock direct INSERT into public.duels.
--
-- The `duels_insert` RLS policy's WITH CHECK constrained `challenger_id` but NEVER
-- `opponent_id`, so any competitor could `POST /rest/v1/duels` directly and name ANY
-- opponent — bypassing every guard request_duel() enforces: the blocked_competitors
-- exclusion, the weekly duel cap, rank/age/geo matchmaking, and both parties'
-- dueling_enabled flag. With minors this is a harassment vector (forced duels +
-- notifications from someone they blocked) and a rating/leaderboard-farming vector.
--
-- All duel creation already flows through request_duel() (SECURITY DEFINER), which
-- assigns the opponent server-side and enforces every guard, so we drop the policy
-- and revoke the direct grant. respond_to_duel() is also SECURITY DEFINER, and there
-- is no UPDATE/DELETE policy on duels (RLS default-denies those), so the in-app duel
-- lifecycle is unaffected.

drop policy if exists duels_insert on public.duels;
revoke insert on public.duels from authenticated, anon;
