// =====================================================================
// NMAO Tournament Engine — resolve + rating core
// Pure, DB-free, deterministic. Turns judge scores into placements, then
// placements into rating changes. See docs/scoring-and-rating.md for the
// plain-language explanation of every formula below.
//
// Design (locked with Bradley):
//  - A pod's score for an entry = straight average of its judges' scores.
//  - Placement = score desc; tiebreak: highest single-judge score, then
//    earliest submission.
//  - Rating moves on PLACEMENT, compared ONLY against same-rank podmates.
//  - Everyone seeds at 50; faster K for the first 3 rounds, then steady.
//  - Rating never crosses a rank bracket — that is a real dojo promotion.
// =====================================================================

export type RatingConfig = {
  seed: number;              // starting rating for a brand-new competitor
  D: number;                 // spread constant (bigger = gentler favorites)
  kProvisional: number;      // learning rate for a competitor's first rounds
  kSteady: number;           // learning rate afterwards
  provisionalRounds: number; // how many of a competitor's rounds are "fast"
  ratingMin: number;
  ratingMax: number;
};

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  seed: 50,
  D: 40,
  kProvisional: 8,
  kSteady: 4,
  provisionalRounds: 3,
  ratingMin: 0,
  ratingMax: 100,
};

// ---------- scoring & placement ----------

export type PodEntry = {
  entryId: string;
  competitorId: string;
  rank: string;          // rank-bracket key (beginner|intermediate|advanced)
  judgeScores: number[]; // 1 score (beg/int) or 3 scores (advanced)
  submittedAt: number;   // epoch ms; earlier wins ties
};

export type PodResult = {
  entryId: string;
  competitorId: string;
  rank: string;
  score: number;       // straight average of judgeScores
  topJudge: number;    // highest single-judge score (tiebreak #1)
  submittedAt: number; // tiebreak #2 (earlier first)
  placement: number;   // 1 = first
};

function mean(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / a.length;
}

/**
 * Aggregate judge scores into a pod score, then rank entries into placements.
 * Straight average; tiebreak highest-single-judge then earliest submission.
 */
export function resolvePod(entries: PodEntry[]): PodResult[] {
  const scored: PodResult[] = entries.map((e) => ({
    entryId: e.entryId,
    competitorId: e.competitorId,
    rank: e.rank,
    score: mean(e.judgeScores),
    topJudge: Math.max(...e.judgeScores),
    submittedAt: e.submittedAt,
    placement: 0,
  }));
  scored.sort(
    (a, b) =>
      b.score - a.score ||            // higher pod score first
      b.topJudge - a.topJudge ||      // tiebreak 1: highest single-judge score
      a.submittedAt - b.submittedAt,  // tiebreak 2: earliest submission
  );
  scored.forEach((r, i) => {
    r.placement = i + 1;
  });
  return scored;
}

// ---------- rating update ----------

export type RatingState = { rating: number; roundsPlayed: number };
export type RatingChange = {
  before: number;
  delta: number;      // after - before (post-clamp)
  after: number;
  opponents: number;  // same-rank podmates this move was measured against
  k: number;          // learning rate applied (for transparency/audit)
};

/**
 * Placement-based, same-rank-only rating update for one resolved pod.
 *
 * For competitor i, against each SAME-RANK podmate j:
 *   E_ij = 1 / (1 + 10^((R_j - R_i)/D))          // expected result
 *   A_ij = 1 if i placed above j, 0 if below, .5 if tied
 * delta_i = (K / opponents) * Σ (A_ij - E_ij)     // normalized by pod size
 * R_i'    = clamp(R_i + delta_i, min, max)
 *
 * A competitor with no same-rank podmate (e.g. the lone beginner in a
 * collapsed pod) does not move — honoring "only within your bracket".
 * Does NOT mutate `states`; returns the changes for the caller to persist.
 */
export function updateRatings(
  results: PodResult[],
  states: Record<string, RatingState>,
  cfg: RatingConfig = DEFAULT_RATING_CONFIG,
): Record<string, RatingChange> {
  const stateOf = (id: string): RatingState =>
    states[id] || { rating: cfg.seed, roundsPlayed: 0 };

  const out: Record<string, RatingChange> = {};

  for (const me of results) {
    const my = stateOf(me.competitorId);
    const Ri = my.rating;
    const opps = results.filter(
      (o) => o.competitorId !== me.competitorId && o.rank === me.rank,
    );
    const k = my.roundsPlayed < cfg.provisionalRounds ? cfg.kProvisional : cfg.kSteady;

    let delta = 0;
    if (opps.length > 0) {
      let raw = 0;
      for (const opp of opps) {
        const Rj = stateOf(opp.competitorId).rating;
        const E = 1 / (1 + Math.pow(10, (Rj - Ri) / cfg.D));
        const A = me.placement < opp.placement ? 1 : me.placement > opp.placement ? 0 : 0.5;
        raw += A - E;
      }
      delta = (k / opps.length) * raw;
    }

    const after = Math.max(cfg.ratingMin, Math.min(cfg.ratingMax, Ri + delta));
    out[me.competitorId] = {
      before: Ri,
      delta: after - Ri,
      after,
      opponents: opps.length,
      k,
    };
  }
  return out;
}
