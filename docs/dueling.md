# NMAO — Dueling (competitor app feature)

*Async, anytime 1-v-1 video duels between competitors, **judged by the community**
(competitors nationwide vote on the winner). Completely **separate from the monthly
tournament flow** — its own loop, its own leaderboard, its own badges. Minor-safe by
design.*

Last updated: 2026-08-08

---

## 1. Principles

- **Anytime, standalone.** A duel can start any day; it is **not** tied to a round,
  deadline, division, rating, points, or medals of the monthly tournament.
- **Community-judged.** Other competitors across the country decide the winner by
  **vote** — a closed, verified community, not the public web.
- **Opt-in & controlled.** A student can only duel if their **school grants the
  power** (per-student), and only within the **geographic area the school allows**.
- **Safe for kids.** Closed community, guardian-gated, **no free-text comments**,
  anonymous vote tallies, sharing off by default.

## 2. Eligibility & matchmaking

- **School must enable dueling** for the student (the Dueling toggle in the School
  Portal's Tournament Controls). Off by default — not for everyone.
- **School-set dueling area.** Each school chooses the area its students may duel
  against — e.g., *exclude opponents within X miles* (so students don't duel a rival
  school down the street) and/or *limit to a state/region/country*. Matchmaking
  respects **both** schools' rules.
- **Fair pairing.** Opponents are matched by **rank/class + category** (kata form or
  weapon form). A competitor can **challenge a friend** directly or request a
  **random** eligible opponent.

## 3. The flow

1. **Challenge** — pick a friend or "find opponent" (random, eligible); choose the
   **duel type** (kata / weapon form) and a response deadline.
2. **Accept / decline** — the opponent gets a notification and accepts or declines
   (with an optional pre-set, guardian-approved note).
3. **Both upload** — each competitor uploads their performance (reuse the Compete
   upload; no fee).
4. **Duel goes live** — a duel page shows both performances **side-by-side**; it
   enters the **voting pool**.
5. **Community voting** — competitors nationwide are notified ("a new duel dropped —
   vote now") and pick a winner. Voting is open for a set window (e.g. 48–72h).
6. **Winner declared** — majority vote at close; an eye-catching reveal. Updates both
   duelists' **dueling record + leaderboard**; awards dueling badges.
7. **Rematch** — one tap to run it back.

## 4. Voting model

- **Who votes:** verified competitors only (closed community). **One vote per duel**
  per competitor; **can't vote on your own** duel.
- **Watch-to-vote:** a vote only counts after the voter has actually viewed both
  entries (min. playback) — keeps votes honest and rewards genuine attention.
- **No comments** (for minor safety) — the vote is a clean A/B "who won?" Optional
  pre-set encouragements only ("Great kime!", "Strong stance!"), never free text.
- **Anti-brigading:** hide the running tally until near close (reduces bandwagon),
  rate-limit, one-account-one-vote, flag collusion patterns.
- **Ties:** decided by the higher dueling rank, else declared a **draw** (both keep
  their streak). Configurable.

## 5. Notifications

- Voter: **"A new duel dropped — vote now."** (Batched/daily-digest-able so kids
  aren't pinged constantly; guardian-controllable.)
- Duelist: challenge received / accepted, duel live, **voting closes soon**, result
  ready.

## 6. Voting rewards (encourage voting) — brainstorm + recommendation

Voting only works if competitors show up to vote, so reward it — but **intrinsic and
non-addictive**, no pay-to-win, no dark patterns aimed at kids:

- **Voter badges** *(recommended)* — First Vote; **Voice of the People** I/II/III
  (N votes); **Daily Voter** (a voting streak). See badge catalog.
- **Sharp Eye — accuracy reputation** *(recommended)* — when your pick matches the
  eventual winner, your accuracy rises; earns a **"Trusted Voter"** title/badge.
  Skill-based and fun; **cosmetic only** (votes never weigh differently — fairness).
- **Kingmaker moment** — if your vote is in a duel decided by a razor-thin margin,
  a little "your vote mattered" flourish (+ badge).
- **Effort points for voting** *(small, capped)* — a few **Total Points** per vote,
  daily-capped and only when watch-to-vote is satisfied, so it feeds the lifetime
  effort accumulator without inviting spam.
- **Monthly voter raffle** *(optional, flag legal)* — each qualifying vote = one
  entry into a monthly draw for a **pin / merch / a free something**. Motivating and
  fair, but must be sweepstakes-compliant and **guardian-gated** for minors.
- **Give-to-get, gently** — voting keeps you an **active community member** and can
  modestly boost how quickly *your own* duels get surfaced for votes — framed as
  participation, never coercion.

**Recommended mix:** voter badges + Sharp-Eye accuracy + small capped Total Points,
with the raffle as an optional later add (pending legal). Avoid anything that pressures
kids to vote or that lets voting buy competitive advantage.

## 7. Dueling badges

A dedicated series (see `badge-catalog.md` → Dueling + Voting): First Duel, Duelist
I/II/III, First Win, Warpath (win streak), Road Warrior (opponents from many
states/schools), People's Champion (landslide win), Rivalry (rematch), plus the
**voter** badges above. Dueling badges are their own collectible set — great pins.

## 8. Dueling leaderboard (connects to the existing leaderboards)

Add **Dueling** as a scope in the Leaderboards surface (alongside Me / School /
Location, City·State·Country·World):

- **Duelist stats:** duel **wins**, **win rate**, **win streak**, duels fought, and
  a separate **duel rating** (win/loss Elo — kept distinct from the tournament
  rating since dueling is standalone).
- **Voter stats:** votes cast, **voting streak**, **Sharp-Eye accuracy** — a
  community-contribution board that celebrates the people who power the judging.
- Geographic tiers apply (top duelists by City → World). Dueling has its own
  **seasons/monthly resets** for streaks/ladders, independent of the tournament
  season.

## 9. Safety (COPPA)

Closed verified community (no public web voting); dueling **opt-in per student by the
school**; **guardian-gated** (guardians can disable dueling, voting, and
notifications); **no free-text comments**; anonymous aggregate tallies; sharing off by
default; the school's geo rules prevent uncomfortable local match-ups.

## 10. Data model

- `duels (id, challenger_id, opponent_id, type ['kata'|'weapon'], status
  ['pending'|'accepted'|'declined'|'live'|'voting'|'complete'], challenger_video,
  opponent_video, opens_vote_at, closes_vote_at, winner_id, created_at)`
- `duel_votes (duel_id, voter_id, choice, watched bool, created_at)` — unique
  (duel_id, voter_id).
- `duel_ratings (competitor_id, rating, wins, losses, streak, updated_at)` and
  `voter_stats (competitor_id, votes_cast, streak, correct, accuracy)`.
- Reuse `competitors`, school geo + dueling-eligibility flags. RLS: competitors read
  the voting pool + their own duels; guardians see their child's.

## 11. Phase & open questions

- **Phase 2** (after the monthly tournament + competitor-app core + portal Phase 1).
- Open: exact **voting window** length and **min voters** for a valid result.
- Open: **duel rating** formula (simple Elo) — separate from tournament rating (yes).
- Open: **cross-school/state** friendlies vs. strict same-area exclusion — governed
  by each school's dueling-area setting.
- Open: raffle rewards — **legal review** for youth sweepstakes before enabling.
