# Dueling — locked decisions (build spec)

_Supersedes the contradicting parts of `DUELING-HANDOFF.md` (§4 voting, §5 economics timing, §7–8 reveal). Decisions locked 2026-08-13. Data model: `supabase/migrations/20260812000000_dueling_core.sql`._

---

## 1. Voting model — OPEN voting
- **Anyone** casts **one vote per duel** for **whoever they want** — no same-school exclusion, and **participants may vote on their own duel** (a school can back its own competitor; scale + caps keep it fair). One vote enforced by `unique(duel_id, voter_competitor_id)`.
- **Watch-to-vote:** a vote only counts after **≥ 15 seconds** of viewing (server-confirmed in the cast RPC).
- **Vote queue** steers each voter toward under-voted live duels (distribution > raw volume for accuracy).
- **Tally hidden** until near close (reduce bandwagon); rate-limit; flag collusion/timing patterns.
- **Certify:** a result needs **≥ 3 votes**. Under 3 at close → auto-extend once (+24h); still under 3 → **no-contest**.
- **Winner:** simple majority at close.

## 2. Sudden death (tie at close, ≥3 votes)
- Flip to a **fixed 60-minute window** + push blast: _"⚔️ Sudden death! Vote now — 60 minutes left!"_
- **No early exit** — whatever the standing is at the **end** of the 60 minutes decides.
- Still tied at the end → **deadlock draw** (both keep streaks + earn the Deadlock badge).

## 3. Ratings, streaks, seasons
- **Duel Elo** is separate from the tournament rating (start 1200; K-factor TBD).
- **Forfeit-win** (opponent no-shows) = counts as a **win + streak**, but **Elo-neutral** (no swing on an uncontested duel).
- **Deadlock / draw** = **Elo-neutral**, **preserves streak**, still counts as a duel fought.
- **Loss** breaks a win streak.
- **Season reset:** monthly **leaderboard/standings reset**; **rating carries over with light decay**.
- **Leaderboard (big later build, north star):** rank **competitors AND schools**, across **monthly / seasonal / all-time**, and across **traditional forms / open forms / weapons / future events**.

## 4. Matchmaking & eligibility
- **Hard-matched** by rank/class + category (kata form / weapon form) for now. An **open "savages" category** (cross-rank) comes later.
- Direct challenge (a friend) or request a **random eligible** opponent.
- **Dueling-area geo rules** — each school sets who its students may face (exclusion radius / state / region); matchmaking respects **both** schools' rules.
- Enable dueling **per student** in the School Portal (off by default). Guardian can disable.

## 5. Video rules (same as the monthly tournament)
- **Unedited, 30s–2min, up to 2 angles, full-body, clear area** (no branding), good light/audio.
- **Monthly password** spoken + on-screen (name/date/category too) — **the same password used for that month's tournament**.
- **Reuse:** the **same video may face multiple opponents within the month** (password still valid). **Cannot** reuse across months (next month's password won't be in the clip). A different video per duel is also fine.

## 6. Timings (tunable defaults)
Respond **48h** → upload **72h** after acceptance → voting **48h** → sudden-death **60min** → one **auto-extend (+24h)** if under the vote minimum at close.

## 7. Weekly cap
**4 active duels per competitor per week** (supply throttle → concentrates votes → accuracy; also a Phase-2 revenue lever).

## 8. The two reveals (SEPARATE builds)
- **Duel reveal — frequent, lighter.** Fires when a duel closes; shows *that duel's* outcome with a bit of flair. Happens often, so it's quick.
- **Monthly tournament reveal — the spectacular one, now unified with dueling.** Absorbs the dueling celebration: **badges earned, medals, highest duel streak, duels won, positive stat improvements, an encouraging message** — lengthy, cinematic, **positivity-only**.
- **Badges unveil at the MONTHLY reveal** (not the duel reveal) — so a competitor who lost duels still opens the month to a wall of earned badges + growth. Cushions the losses.
- _Reveal + badge-border polish is a later pass (Brad's note)._

## 9. Positive-only curation (with an honest record)
- The **reveals are highlight reels** — surface rating **gains**, wins, streaks, badges; **omit** rating **drops** and losses.
- The **profile / leaderboard is the honest record** — the true current rating always lives there. We curate the *celebration*, never falsify the *data*.

## 10. Badges & frames
- Earned continuously, **revealed monthly**. The built kit is `badge-frames/` (all 100 frame specs) + `docs/badge-art/`.
- **Tooltip everywhere a badge/frame appears** (profile, arena, leaderboard): **hover** on desktop, **tap** in the Expo app → shows the badge **name + meaning** ("Season 1 Tournament Champion").
- Equipped frame rings the competitor's video in the side-by-side arena (Phase 3).

## 11. Economics — Duelist Membership (Phase 2)
- **$3.99/mo** gates the ability to **create/accept** a duel. **Voting is free for everyone.**
- Weekly cap (§7) also throttles supply. **Cosmetic season pass** of frames = the aspirational layer.
- **Guardian is the billing account holder** (COPPA); app-store IAP + 15–30% cut; **cosmetic-only, never pay-to-win**; any raffle **free-entry**.
- Table `duel_memberships` exists now; the gate is enforced in Phase 2 (Phase 1 duels are ungated for testing).

## 12. Safety & moderation (Phase 1 — non-negotiable)
- **Report button** on any duel → auto-hide from the pool (`duels.moderation_status='under_review'`) pending staff review → DQ (`removed`) or restore.
- **The reporter is recorded** (`duel_reports.reporter_competitor_id`) so false/abusive reports are traceable and accountable.
- Closed verified community; **guardian can disable dueling, voting, and notifications**; **no free text** (preset encouragements only); anonymous aggregate tallies; sharing off by default; billing via guardian.

## 13. Notifications (all guardian-controllable, batchable)
challenge received / accepted / declined · upload reminder · duel is live · voting closes soon · **⚔️ sudden death** · duel reveal ready · monthly reveal ready · **tournament deadline approaching → send your footage into the tournament**.

## 14. Tournament funnel
Dueling is the **practice loop that feeds the monthly tournament**. As the tournament submission window nears, active duelists are prompted to upload into the tournament flow. The monthly-reveal loser-path CTA also points to the next tournament ("You've been sharpening — bring it to the [Month] tournament").

## 15. Content banks (wire to `reveal_sayings` / `motivational_sayings`, not hardcoded)

**In-duel quick reactions** (preset only, no free text):
Great kime! · Strong stance! · Beautiful form! · Sharp focus! · Powerful! · So smooth! · Excellent control! · Warrior spirit! · Respect 🙇 · Clean technique! · Unshakable! · That was crisp! · Perfect timing! · Explosive! · Rooted!

**Inspirational / reveal bank** (keyed to positive signals):
- _Won:_ On fire this month. · The community saw your fire. · Champion's rhythm. · You earned every vote. · Unstoppable this season. · The arena knows your name.
- _Effort / showed up:_ Every duel sharpened your edge. · Consistency is its own victory. · You put in the reps — it shows. · Discipline, on repeat. · Show up, level up.
- _Grew but didn't place:_ Closer than last month — the climb is real. · Exactly the training the next tournament rewards. · Losses today, technique for tomorrow. · Sharpen here, shine at the tournament. · Every rep is a deposit. · The gap is closing.
- _Voting / community:_ The community trusts your eye. · A fair witness, every time. · Your votes help crown champions. · Sharp eye, steady hand. · You keep the arena honest.
- _Streak / resilience:_ Unbroken. · Back on the mat, stronger. · Warriors rise — you're rising. · Bend, never break. · Forged, not given.
- _Respect / spirit:_ Honor in every bow. · A true martial artist — win or draw. · Discipline like yours builds legends. · Strength with humility. · The mat remembers your respect.
- _First / milestone:_ Your first of many. · The journey begins. · Welcome to the arena. · A first step becomes a path.

_(Expand freely; these seed the tables.)_

## 16. Data model & build order
- **Migration (this slice):** `duels` (+`moderation_status`, `resolved_at`), `duel_votes`, `duel_ratings`, `voter_stats`, `duel_memberships`, `duel_reports` + RLS. Open-voting integrity: `unique(duel_id,voter)` + watch + `status='voting'`.
- **Deferred engine slice (SECURITY DEFINER RPCs + cron):** challenge/accept/decline/upload transitions (with the 4/week cap + no-show forfeit); `cast_duel_vote` (confirm ≥15s watched + update `voter_stats`); `vote_queue`; **close/certify** (≥3, hidden tally, majority → 60-min sudden death → deadlock/no-contest) + duel Elo; **monthly reveal** job that batches `badge_awards` on `resolved_at`; **season reset**; **moderation** resolve RPC.
- **Shared dependency to build first:** the **signed video playback seam** (`get-playback-url`) — voters must watch two clips from the private bucket. Dueling hard-depends on it (also unblocks judge playback).
- **Public duel-pool read view** — `competitors` RLS hides other competitors, so expose only safe public fields (names, school, video, frame) via a `SECURITY DEFINER` view for the arena/queue.

## 17. Open / later
Reveal + badge-border polish · the comprehensive competitor+school leaderboard (monthly/seasonal/all-time × forms/weapons/events) · sponsor placement (voting queue + reveals) · the open "savages" cross-rank category · K-factor + exact tunables · voter raffle (legal review).
