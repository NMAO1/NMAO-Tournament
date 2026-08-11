# Dueling — Comprehensive Handoff (for Claude Code)

*Everything for the dueling feature in one place: the flow, the community-voting model
and its integrity rules, the paid-membership economics, the badge series + earn-rules,
the collectible **badge-frame perks**, the data model, and build phases. Consolidates
`dueling.md`, `badge-catalog.md`, `badge-earn-rules.md`, `badge-frames-effects.md`, and
the recent pricing decisions.*

Last updated: 2026-08-10 · Phase 2 (after monthly tournament + competitor-app core +
portal Phase 1).

---

## 1. What dueling is

Async, anytime **1-v-1 video duels** between competitors, **judged by the community**
(verified competitors nationwide vote on the winner). Completely **separate** from the
monthly tournament — its own loop, leaderboard, badges, rating, and season resets.
Minor-safe by design (closed community, guardian-gated, no free text).

## 2. Eligibility & matchmaking

- **School enables dueling per student** (Dueling toggle in the School Portal's
  Tournament Controls). Off by default.
- **School-set dueling area** — each school sets who its students may face (e.g. exclude
  opponents within X miles; limit to state/region/country). Matchmaking respects **both**
  schools' rules.
- **Fair pairing** by rank/class + category (kata form or weapon form). Challenge a
  friend directly, or request a random eligible opponent.

## 3. The flow

Challenge (pick type + deadline) → accept/decline → both upload (reuse Compete upload,
no fee) → duel goes **live side-by-side** and enters the **voting pool** → community
votes for a window → **winner by majority at close** → updates records/leaderboard +
awards badges → one-tap rematch.

**Default durations (tunable):** challenge response 48h → both upload within 72h of
acceptance → voting window 48h → sudden-death overtime 24h → auto-extend once (+24h) if
under the vote minimum at close.

## 4. Voting model & integrity  ⟵ updated

- **Who votes:** verified competitors only (closed community). **Voting is free and open
  to everyone** — it is *not* behind the paid membership (see §5). Maximizing the judge
  pool is the point.
- **One vote per duel per competitor.** Enforced by `unique(duel_id, voter_competitor_id)`.
- **No self-voting, and no voting on your own school's duels.** A competitor cannot vote
  on any duel where **their school** is a participant. This is the fix for **team
  brigading** — it removes both the ability and the incentive for a school to upvote its
  own student. (One-vote-per-duel alone stops a single person double-voting; the
  same-school exclusion stops a whole team piling on.)
- **Watch-to-vote:** a vote only counts after the voter has actually viewed both entries
  (minimum playback) — honest votes, rewards genuine attention.
- **No comments** for minor safety — a clean A/B "who won?"; optional pre-set
  encouragements only ("Great kime!"), never free text.
- **Anti-brigading:** hide the running tally until near close (reduces bandwagon),
  rate-limit, one-account-one-vote, and flag collusion/timing patterns for review.
- **Certification:** a result needs **≥ 3 votes** (odd, so a minimal result never ties).
  Under 3 by close → auto-extend once; still under 3 → rare **no-contest / draw**.
- **Winner:** simple majority at close.
- **Tie → Sudden Death:** a deadlocked tally flips to short overtime; the next
  tie-breaking vote wins it.
- **Deadlock draw (backstop):** if overtime still expires tied (very rare), it's an
  honest **draw** — both keep streaks and each earns the **Deadlock** badge.

### Accuracy safeguard = distribution, not just volume

Votes-per-duel is the quality metric. Guarantee it with a **voting queue** that steers
each voter toward duels that still need votes (even distribution, not piling onto popular
clips), plus the free gamified voter badges (§7). These matter more than raw dueler
count for verdict accuracy.

## 5. Economics — Duelist Membership  ⟵ new

**Decision: $3.99 / month "Duelist Membership" gates the ability to *duel*. Voting is
free for everyone.** Rationale is two-sided:

- **Revenue** without paywalling the community feature (voting).
- **Supply throttle.** Gating contestants keeps the number of concurrent duels in check,
  so the free voter pool concentrates on fewer duels → **higher votes-per-duel →
  more accurate verdicts.** Price is a supply dial, not just a revenue dial.

Levers (combine as needed):

- **Price:** $3.99/mo (chosen). Higher end of the small range → a smaller, more committed
  dueler pool; keeps voting load healthy.
- **Duel cap:** optionally cap active duels per competitor per week — throttles supply
  directly, independent of price.
- **Season pass (cosmetic):** the collectible **badge-frames** (§8) are the aspirational
  layer — a seasonal track of exclusive frames/effects. Cosmetic only.

**Guardrails (legal review required — not legal advice):**

- **Parent/guardian is the billing account holder** (COPPA); honor auto-renewal
  disclosure laws.
- **App-store IAP** rules + **15–30% platform cut**; extra care for kid-directed apps.
- **Cosmetic only — never pay-to-win.** Membership buys the *ability to duel* and
  *cosmetics*, never judging weight or competitive advantage. Votes always weigh equally.
- **Keep any voting raffle/sweepstakes free-entry** — never let payment buy entries
  (lottery risk). No randomized paid rewards (loot boxes) for minors.

## 6. Notifications

- Voter: "A new duel dropped — vote now" (batched/daily-digestable; guardian-controllable).
- Duelist: challenge received/accepted, duel live, voting closes soon, result ready.

## 7. Badges — dueling & voting series

Full art + earn-rules live in `badge-manifest.csv` and `badge-earn-rules.md`. The
dueling loop awards:

**Dueling**

| code | name | rarity | earn condition |
|---|---|---|---|
| `first-duel` | First Duel | Common | first completed duel |
| `duelist` | Duelist I/II/III | tiered | 5 / 15 / 30 duels |
| `first-blood` | First Blood | Uncommon | first duel win |
| `warpath` | Warpath | Rare | N duel wins in a row |
| `peoples-champion` | People's Champion | Rare | win by a landslide community vote |
| `road-warrior` | Road Warrior | Rare | duel opponents from many states/schools |
| `rivalry` | Rivalry | Uncommon | rematch the same opponent |
| `undefeated-duelist` | Undefeated Duelist | Epic | win streak of X with no losses |
| `iron-duelist` | Iron Duelist | Rare | duel every week for a month |
| `duel-legend` | Duel Legend | Legendary | reach #1 on a dueling leaderboard tier |
| `deadlock` | Deadlock | Epic | a duel ends in a true deadlock draw |

**Voting** (reward the judges — free, non-addictive, cosmetic; no pay-to-win)

| code | name | rarity | earn condition |
|---|---|---|---|
| `first-vote` | First Vote | Common | first vote cast |
| `voice-of-the-people` | Voice of the People I/II/III | tiered | 25 / 100 / 500 votes |
| `daily-voter` | Daily Voter | Uncommon | vote N days in a row |
| `sharp-eye` | Sharp Eye | Rare | your votes match the winner at a high rate |
| `kingmaker` | Kingmaker | Rare | your vote decided a razor-thin duel |
| `fair-witness` | Fair Witness | Uncommon | vote across many divisions/categories |
| `trusted-voter` | Trusted Voter | Epic | sustain elite Sharp-Eye accuracy |

Small, **daily-capped** Total Points per qualified (watch-to-vote) vote feed the lifetime
effort accumulator without inviting spam. Optional monthly **voter raffle** later
(pending legal, guardian-gated, free-entry).

## 8. Badge perks — collectible frame effects ("collect the look")

The payoff that makes badges matter in the arena. Full design + working kit:
`badge-frames-effects.md` + `../badge-frames/` (CSS + runtime + `BadgeFrame.tsx`).

- Every badge **unlocks a signature frame effect** — an animated border/glow/particle
  aura around a competitor's video. Earned via `badge_awards`; **cosmetic, permanent**.
- **Effects escalate with rarity:** Common = flat border, Legendary = full aura + a
  signature motif. Recipes for all 100 in `badge-frames.csv` / `.json` (`frame_spec`).
- **Equip one active frame** (`competitors.equipped_frame_badge_code`) shown around your
  video in the **side-by-side arena** and on your profile.
- **Interaction effects:** Deadlock = electric charge + a lightning arc across the gap
  between the two videos; Rivalry = twin-ring link. (Deadlock arc needs a shared overlay
  between the two `BadgeFrame`s.)
- **Monetization tie-in:** a season pass unlocks exclusive seasonal frames — the thing
  people pay to collect. Still cosmetic-only.

## 9. Leaderboards

Add **Dueling** as a scope alongside Me / School / Location (City·State·Country·World):

- **Duelist stats:** wins, win rate, win streak, duels fought, a separate **duel rating**
  (win/loss Elo, distinct from tournament rating).
- **Voter stats:** votes cast, voting streak, **Sharp-Eye accuracy** — celebrates the
  people who power judging.
- Dueling has its **own seasons/monthly resets**, independent of the tournament season.

## 10. Safety (COPPA)

Closed verified community (no public web voting); dueling opt-in per student by the
school; guardian-gated (guardians can disable dueling, voting, notifications); **no
free-text comments**; anonymous aggregate tallies; sharing off by default; school geo
rules prevent uncomfortable local match-ups; billing through the guardian account.

## 11. Data model

Existing (from `dueling.md`) plus additions for integrity, membership, and frames:

- `duels (id, challenger_id, opponent_id, type['kata'|'weapon'], status['pending'|
  'accepted'|'declined'|'live'|'voting'|'complete'], challenger_video, opponent_video,
  opens_vote_at, closes_vote_at, winner_id, created_at)`
- `duel_votes (duel_id, voter_competitor_id, choice, watched bool, created_at)` —
  **`unique(duel_id, voter_competitor_id)`**. Application/RLS check: reject a vote if the
  voter's school is the challenger's or opponent's school (**same-school exclusion**), or
  if the voter is a duelist in it.
- `duel_ratings (competitor_id, rating, wins, losses, streak, updated_at)`
- `voter_stats (competitor_id, votes_cast, streak, correct, accuracy)`
- `vote_queue` (or a query) — surfaces under-voted live duels to each eligible voter.
- **Membership/entitlement:** `memberships (competitor_id, kind['duelist'], status,
  current_period_end, stripe_subscription_id)` — gate "create/accept duel" on an active
  duelist membership. (Stripe; guardian is the payer. Never store raw card/bank data.)
- **Frames:** `badges.frame_spec jsonb`, `competitors.equipped_frame_badge_code` (unlocks
  derive from `badge_awards`). See `badge-frames-effects.md`.
- **RLS:** competitors read the voting pool + their own duels; guardians see their child's;
  votes enforce the uniqueness + same-school + non-participant rules server-side.

## 12. Build phases

1. **Core loop** — challenge → upload → live side-by-side → free community voting (queue,
   watch-to-vote, ≥3 certify, majority → sudden death → deadlock) → result + dueling/voter
   badges → dueling leaderboard + duel rating.
2. **Membership** — $3.99 duelist membership (Stripe, guardian-billed) gating duel
   creation; optional weekly duel cap.
3. **Frames** — equip badge frames in the arena/profile (kit in `../badge-frames/`);
   season pass of cosmetic frames.
4. **Later** — voter raffle (legal), richer signature motifs, cross-frame Deadlock arc.

## 13. Open items & legal review

- **Legal (counsel before launch):** youth **billing/subscription** + auto-renewal
  compliance; keeping the **voter raffle free-entry** (sweepstakes vs. lottery);
  app-store kid-category rules; the video consent/waiver already tracked in `legal/`.
- **Tunables to set with product:** duel-win-streak thresholds (Warpath / Undefeated
  Duelist), Sharp-Eye accuracy bar, vote minimum (currently 3 — consider a higher target
  for higher-stakes tiers), weekly duel cap, exact durations.
- **Duel rating formula:** simple Elo, separate from tournament rating (confirmed).
- **Same-area policy:** governed per-school by the dueling-area setting.
