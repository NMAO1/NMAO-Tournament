// =====================================================================
// round-controller — SELF-CONTAINED bundle for the Supabase dashboard.
// Paste this whole file as index.ts. No ../_shared imports to resolve.
// (Source of truth remains the split files; regenerate if those change.)
// =====================================================================

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// ----------------------- rating.ts -----------------------
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

// ---------- per-criterion weighted scoring (a judge's single video score) ----------
// Judges score one field per criterion; the video's per-judge score is the
// weighted combination using the style's rubric profile (Traditional or Open).
// See docs/scoring-and-rating.md §1.

export type CriterionScore = { criterionCode: string; rawScore: number };   // each 0-100
export type CriterionWeight = { criterionCode: string; weightPct: number };  // sum to 100 per style

/**
 * Combine a judge's per-criterion scores into their single 0-100 score for a
 * video. `weights` is the style's rubric profile (weight_pct sums to 100).
 * Result = Σ(rawScore × weightPct) / Σ(weightPct present), clamped to [0,100].
 * Normalising by the weight actually present means a partial rubric still
 * yields a sensible 0-100 number rather than an under-count.
 */
export function weightedJudgeScore(scores: CriterionScore[], weights: CriterionWeight[]): number {
  const wByCode = new Map(weights.map((w) => [w.criterionCode, w.weightPct]));
  let weighted = 0;
  let weightSum = 0;
  for (const s of scores) {
    const w = wByCode.get(s.criterionCode);
    if (w == null) continue;
    weighted += s.rawScore * w;
    weightSum += w;
  }
  const denom = weightSum > 0 ? weightSum : 100;
  const score = weighted / denom;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
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

// ----------------------- assignments.ts -----------------------
// =====================================================================
// NMAO Tournament Engine — judge assignment
// Pure, DB-free, deterministic. Assigns judges to each entry's video:
//   - 1 judge for beginner/intermediate pods, 3 for advanced (pod.judgeCount)
//   - never a judge from the competitor's own school (conflict of interest)
//   - load-balanced across the eligible judge pool
// Deterministic tie-break (lowest current load, then judge id) so a given
// input always produces the same assignment — important for reproducibility.
// =====================================================================

export type JudgeInput = { id: string; schoolId: string };
export type AssignEntry = { entryId: string; competitorId: string; schoolId: string };
export type AssignPod = { podId: string; judgeCount: number; entries: AssignEntry[] };

export type Assignment = { entryId: string; judgeIds: string[]; shortfall: number };
export type AssignResult = { assignments: Assignment[]; flags: string[] };

/**
 * Assign judges to every entry across the given pods.
 * @param pods   pods with their entries and required judgeCount (1 or 3)
 * @param judges the eligible judge pool (id + schoolId)
 */
export function assignJudges(pods: AssignPod[], judges: JudgeInput[]): AssignResult {
  const load: Record<string, number> = {};
  for (const j of judges) load[j.id] = 0;

  const assignments: Assignment[] = [];
  const flags: string[] = [];

  for (const pod of pods) {
    for (const entry of pod.entries) {
      // eligible = not from the competitor's school
      const eligible = judges.filter((j) => j.schoolId !== entry.schoolId);
      eligible.sort((a, b) => load[a.id] - load[b.id] || a.id.localeCompare(b.id));

      const picked = eligible.slice(0, pod.judgeCount);
      for (const j of picked) load[j.id] += 1;

      const shortfall = pod.judgeCount - picked.length;
      if (shortfall > 0) {
        flags.push(
          `Entry ${entry.entryId} needs ${pod.judgeCount} judge(s) but only ${picked.length} eligible (own-school conflicts leave too few).`,
        );
      }
      assignments.push({ entryId: entry.entryId, judgeIds: picked.map((j) => j.id), shortfall });
    }
  }
  return { assignments, flags };
}

// ----------------------- distribute.ts -----------------------
// =====================================================================
// NMAO Tournament Engine — distribute core (pipeline step 6.8)
// Pure, DB-free, deterministic.
//
// Builds the medal ship list: one grouped shipment per school. Every
// competitor who competed gets the collectible interlocking segment
// ('participation'); pod placements 1/2/3 additionally get gold/silver/
// bronze. Schools are shipped one box for the instructor to hand out.
// =====================================================================

export type ResultRow = {
  entryId: string;
  competitorId: string;
  competitorName: string;
  schoolId: string;
  event: string;
  placement: number; // within-pod placement from resolvePod
};

export type MedalType = 'gold' | 'silver' | 'bronze' | 'participation';

export type ShipItem = {
  competitorId: string;
  competitorName: string;
  event: string;
  placement: number;
  medals: MedalType[]; // always includes 'participation'; plus a placement medal for top 3
};

export type SchoolShipment = {
  schoolId: string;
  schoolName: string;
  address: unknown;
  itemCount: number;
  items: ShipItem[];
};

export type ShipList = {
  shipments: SchoolShipment[];
  totalMedals: number;
};

const PLACEMENT_MEDAL: Record<number, MedalType> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

export function buildShipList(
  results: ResultRow[],
  schools: Record<string, { name: string; address?: unknown }>,
): ShipList {
  const bySchool = new Map<string, ShipItem[]>();

  for (const r of results) {
    const medals: MedalType[] = ['participation'];
    const placementMedal = PLACEMENT_MEDAL[r.placement];
    if (placementMedal) medals.push(placementMedal);

    const item: ShipItem = {
      competitorId: r.competitorId,
      competitorName: r.competitorName,
      event: r.event,
      placement: r.placement,
      medals,
    };
    if (!bySchool.has(r.schoolId)) bySchool.set(r.schoolId, []);
    bySchool.get(r.schoolId)!.push(item);
  }

  const shipments: SchoolShipment[] = [...bySchool.keys()]
    .sort()
    .map((schoolId) => {
      const items = bySchool
        .get(schoolId)!
        .sort(
          (a, b) =>
            a.competitorName.localeCompare(b.competitorName) ||
            a.event.localeCompare(b.event),
        );
      const meta = schools[schoolId] ?? { name: schoolId, address: null };
      const itemCount = items.reduce((s, it) => s + it.medals.length, 0);
      return {
        schoolId,
        schoolName: meta.name,
        address: meta.address ?? null,
        itemCount,
        items,
      };
    });

  const totalMedals = shipments.reduce((s, sh) => s + sh.itemCount, 0);
  return { shipments, totalMedals };
}

// ----------------------- engine.ts -----------------------
// =====================================================================
// NMAO Tournament Engine — orchestration layer (spec §14)
// Each pipeline step is an idempotent operation keyed by (round_id, step)
// via round_step_runs. Steps read/write through an EngineStore interface,
// so the same orchestration runs against Supabase in production and an
// in-memory store in tests. The pure cores (assignments, rating, distribute)
// do all the real logic.
// =====================================================================


export type StepName = 'assign_judges' | 'resolve' | 'distribute';
export type StepStatus = 'pending' | 'running' | 'done' | 'error';

// A pod ready to resolve: its videos' scores plus each entry's rating state.
export type PodForResolve = {
  podId: string;
  entries: Array<
    PodEntry & {
      schoolId: string;
      competitorName: string;
      event: string;
      rating: number;       // current carry-over rating (0-100)
      roundsPlayed: number; // rated rounds already completed (drives K)
    }
  >;
};

export type ResultWrite = {
  entryId: string;
  podId: string;
  score: number;
  placement: number;
  ratingDelta: number;
  ratingAfter: number;
};

export type RatingWrite = {
  competitorId: string;
  entryId: string;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  opponents: number;
  k: number;
};

// Everything a step needs from the database, behind one seam. Methods may
// be sync (in-memory tests) or async (Supabase adapter): the orchestration
// awaits every call, so both work.
type Await<T> = T | Promise<T>;

export interface EngineStore {
  getStepStatus(roundId: string, step: StepName): Await<StepStatus | null>;
  setStepStatus(roundId: string, step: StepName, status: StepStatus, detail?: unknown): Await<void>;

  // assign_judges
  getPodsForAssignment(roundId: string): Await<AssignPod[]>;
  getJudgePool(roundId: string): Await<JudgeInput[]>;
  saveAssignments(roundId: string, assignments: Assignment[]): Await<void>;

  // resolve (+ ratings)
  getPodsForResolve(roundId: string): Await<PodForResolve[]>;
  saveResults(roundId: string, rows: ResultWrite[]): Await<void>;
  saveRatingUpdates(roundId: string, rows: RatingWrite[]): Await<void>;

  // distribute
  getResultsForShipping(roundId: string): Await<ResultRow[]>;
  getSchools(roundId: string): Await<Record<string, { name: string; address?: unknown }>>;
  saveShipList(roundId: string, list: ReturnType<typeof buildShipList>): Await<void>;
}

export type StepOutcome = { step: StepName; ran: boolean; flags: string[]; detail?: unknown };

// Idempotency wrapper: a step already 'done' is a no-op; a step 'running'
// is treated as in-flight and skipped. Errors mark the step 'error'.
async function idempotent(
  store: EngineStore,
  roundId: string,
  step: StepName,
  work: () => Promise<{ flags: string[]; detail?: unknown }>,
): Promise<StepOutcome> {
  const status = await store.getStepStatus(roundId, step);
  if (status === 'done') return { step, ran: false, flags: [], detail: 'already done' };
  if (status === 'running') return { step, ran: false, flags: [], detail: 'in flight' };

  await store.setStepStatus(roundId, step, 'running');
  try {
    const { flags, detail } = await work();
    await store.setStepStatus(roundId, step, 'done', detail);
    return { step, ran: true, flags, detail };
  } catch (err) {
    await store.setStepStatus(roundId, step, 'error', String(err));
    throw err;
  }
}

// ---------- step: assign judges ----------
export function stepAssignJudges(store: EngineStore, roundId: string): Promise<StepOutcome> {
  return idempotent(store, roundId, 'assign_judges', async () => {
    const pods = await store.getPodsForAssignment(roundId);
    const judges = await store.getJudgePool(roundId);
    const { assignments, flags } = assignJudges(pods, judges);
    await store.saveAssignments(roundId, assignments);
    const totalJudges = assignments.reduce((s, a) => s + a.judgeIds.length, 0);
    return { flags, detail: { videos: assignments.length, judgesAssigned: totalJudges } };
  });
}

// ---------- step: resolve (+ update ratings) ----------
export function stepResolve(
  store: EngineStore,
  roundId: string,
  ratingCfg: RatingConfig = DEFAULT_RATING_CONFIG,
): Promise<StepOutcome> {
  return idempotent(store, roundId, 'resolve', async () => {
    const pods = await store.getPodsForResolve(roundId);
    const results: ResultWrite[] = [];
    const ratings: RatingWrite[] = [];

    for (const pod of pods) {
      const resolved = resolvePod(pod.entries);
      // rating states for everyone in the pod (before this round)
      const states: Record<string, RatingState> = {};
      for (const e of pod.entries) states[e.competitorId] = { rating: e.rating, roundsPlayed: e.roundsPlayed };
      const changes = updateRatings(resolved, states, ratingCfg);

      const byEntry = new Map(resolved.map((r) => [r.entryId, r]));
      for (const e of pod.entries) {
        const r = byEntry.get(e.entryId)!;
        const ch = changes[e.competitorId];
        results.push({
          entryId: e.entryId,
          podId: pod.podId,
          score: round2(r.score),
          placement: r.placement,
          ratingDelta: round2(ch.delta),
          ratingAfter: round2(ch.after),
        });
        ratings.push({
          competitorId: e.competitorId,
          entryId: e.entryId,
          ratingBefore: round2(ch.before),
          ratingAfter: round2(ch.after),
          ratingDelta: round2(ch.delta),
          opponents: ch.opponents,
          k: ch.k,
        });
      }
    }

    await store.saveResults(roundId, results);
    await store.saveRatingUpdates(roundId, ratings);
    return { flags: [], detail: { pods: pods.length, results: results.length } };
  });
}

// ---------- step: distribute (ship list) ----------
export function stepDistribute(store: EngineStore, roundId: string): Promise<StepOutcome> {
  return idempotent(store, roundId, 'distribute', async () => {
    const results = await store.getResultsForShipping(roundId);
    const schools = await store.getSchools(roundId);
    const list = buildShipList(results, schools);
    await store.saveShipList(roundId, list);
    return { flags: [], detail: { shipments: list.shipments.length, medals: list.totalMedals } };
  });
}

// ---------- controller: run the tail of the pipeline in order ----------
// (classify/collapse/form_pods are the divisioning steps handled upstream.)
export async function runPipelineTail(
  store: EngineStore,
  roundId: string,
  ratingCfg: RatingConfig = DEFAULT_RATING_CONFIG,
): Promise<StepOutcome[]> {
  return [
    await stepAssignJudges(store, roundId),
    await stepResolve(store, roundId, ratingCfg),
    await stepDistribute(store, roundId),
  ];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ----------------------- supabaseStore.ts -----------------------
// =====================================================================
// NMAO Tournament Engine — Supabase-backed EngineStore (Deno / Edge)
// Implements the async EngineStore seam from engine.ts against the engine
// schema (rounds/pods/entries/judge_assignments/results) plus 001's
// skill_ratings / rating_history for persistent carry-over ratings.
//
// Uses the LOCKED rating model (docs/scoring-and-rating.md): rating is a
// 0-100 number seeded at 50, moved on placement vs same-rank podmates.
//
// Runs on Supabase Edge Functions (Deno), as the service role (bypasses
// RLS by design). NOT exercised by `npm test`, which covers the pure cores
// and the in-memory orchestration.
//
// Schema follow-ups this adapter assumes (tracked in docs/project-log.md):
//   - judges need a school link (`judges.school_id`) so own-school conflicts
//     can be excluded; until then conflict exclusion is a no-op.
//   - a `medal_shipments` table (or reuse of `medals`) to persist the ship list.
//   - skill_ratings.rating defaults to the seed (50) for a new competitor;
//     skill_ratings.events_count drives the provisional K.
// =====================================================================


// Season-1 events encode style in their key: `open_*` = Open profile, else Traditional.
export function styleFromEvent(event: string): 'traditional' | 'open' {
  return event.startsWith('open') ? 'open' : 'traditional';
}

// A judge submits one score per criterion (0-100). We persist the per-criterion
// rows (audit) and compute the video's single weighted score via the style's
// rubric profile, storing it on judge_assignments.score so the resolve/rating
// pipeline is unchanged. Called from the judge app's submit action.
export async function submitJudgeScores(
  db: SupabaseClient,
  args: { entryId: string; judgeId: string; event: string; scores: { criterionCode: string; rawScore: number }[] },
): Promise<number> {
  const style = styleFromEvent(args.event);
  const { data: weightRows } = await db
    .from('rubric_weights')
    .select('criterion_code, weight_pct')
    .eq('style', style);
  const weights = (weightRows ?? []).map((w: any) => ({ criterionCode: w.criterion_code, weightPct: Number(w.weight_pct) }));

  await db.from('submission_scores').upsert(
    args.scores.map((s) => ({
      entry_id: args.entryId,
      judge_id: args.judgeId,
      criterion_code: s.criterionCode,
      raw_score: s.rawScore,
    })),
    { onConflict: 'entry_id,judge_id,criterion_code' },
  );

  const score = weightedJudgeScore(args.scores, weights);
  await db
    .from('judge_assignments')
    .update({ score, state: 'submitted', submitted_at: new Date().toISOString() })
    .eq('entry_id', args.entryId)
    .eq('judge_id', args.judgeId);
  return score;
}

export function createSupabaseStore(client?: SupabaseClient): EngineStore {
  const db =
    client ??
    createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

  return {
    // ---------- idempotency ledger ----------
    async getStepStatus(roundId, step) {
      const { data } = await db
        .from('round_step_runs')
        .select('status')
        .eq('round_id', roundId)
        .eq('step', step)
        .maybeSingle();
      return (data?.status ?? null) as StepStatus | null;
    },
    async setStepStatus(roundId, step, status, detail) {
      const patch: any = { round_id: roundId, step, status, detail: detail ?? null };
      if (status === 'running') patch.started_at = new Date().toISOString();
      if (status === 'done' || status === 'error') patch.completed_at = new Date().toISOString();
      await db.from('round_step_runs').upsert(patch, { onConflict: 'round_id,step' });
    },

    // ---------- assign_judges ----------
    async getPodsForAssignment(roundId) {
      const { data: pods } = await db
        .from('pods')
        .select('id, judge_count, divisions!inner(round_id)')
        .eq('divisions.round_id', roundId);
      const out: AssignPod[] = [];
      for (const p of pods ?? []) {
        const { data: entries } = await db
          .from('entries')
          .select('id, competitor_id, competitors(school_id)')
          .eq('pod_id', (p as any).id)
          .eq('status', 'valid');
        out.push({
          podId: (p as any).id,
          judgeCount: (p as any).judge_count ?? 1,
          entries: (entries ?? []).map((e: any) => ({
            entryId: e.id,
            competitorId: e.competitor_id,
            schoolId: e.competitors?.school_id ?? '',
          })),
        });
      }
      return out;
    },
    async getJudgePool(_roundId) {
      const { data } = await db
        .from('judges')
        .select('id, school_id')
        .eq('status', 'active')
        .eq('background_check_status', 'cleared');
      return (data ?? []).map((j: any): JudgeInput => ({ id: j.id, schoolId: j.school_id ?? '' }));
    },
    async saveAssignments(_roundId, assignments: Assignment[]) {
      const rows: any[] = [];
      const entryIds = assignments.map((a) => a.entryId);
      const { data: entryRows } = await db.from('entries').select('id, pod_id').in('id', entryIds);
      const podByEntry = new Map((entryRows ?? []).map((r: any) => [r.id, r.pod_id]));
      for (const a of assignments) {
        const role = a.judgeIds.length > 1 ? 'panel' : 'sole';
        for (const jid of a.judgeIds) {
          rows.push({ entry_id: a.entryId, judge_id: jid, pod_id: podByEntry.get(a.entryId), role, state: 'assigned' });
        }
      }
      if (rows.length) {
        // unique (entry_id, judge_id) makes this idempotent.
        await db.from('judge_assignments').upsert(rows, { onConflict: 'entry_id,judge_id', ignoreDuplicates: true });
      }
    },

    // ---------- resolve (+ ratings) ----------
    async getPodsForResolve(roundId) {
      const { data: pods } = await db
        .from('pods')
        .select('id, divisions!inner(round_id)')
        .eq('divisions.round_id', roundId);
      const result: PodForResolve[] = [];

      for (const pod of pods ?? []) {
        const { data: entries } = await db
          .from('entries')
          .select('id, competitor_id, event, created_at, declared_rank, competitors(first_name, last_name, school_id)')
          .eq('pod_id', (pod as any).id)
          .eq('status', 'valid');

        const podEntries = [];
        for (const e of entries ?? []) {
          const ee = e as any;
          const { data: assigns } = await db
            .from('judge_assignments')
            .select('score, submitted_at')
            .eq('entry_id', ee.id)
            .not('score', 'is', null);
          const judgeScores = (assigns ?? []).map((a: any) => Number(a.score));
          if (judgeScores.length === 0) continue; // incomplete pod: handled by reopen flow, not here

          const { data: sr } = await db
            .from('skill_ratings')
            .select('rating, events_count')
            .eq('competitor_id', ee.competitor_id)
            .maybeSingle();

          const submittedAt = (assigns ?? [])
            .map((a: any) => (a.submitted_at ? Date.parse(a.submitted_at) : Date.parse(ee.created_at)))
            .reduce((m: number, t: number) => Math.min(m, t), Number.MAX_SAFE_INTEGER);

          podEntries.push({
            entryId: ee.id,
            competitorId: ee.competitor_id,
            rank: ee.declared_rank,
            judgeScores,
            submittedAt,
            schoolId: ee.competitors?.school_id ?? '',
            competitorName: `${ee.competitors?.first_name ?? ''} ${ee.competitors?.last_name ?? ''}`.trim(),
            event: ee.event,
            rating: sr?.rating != null ? Number(sr.rating) : DEFAULT_RATING_CONFIG.seed,
            roundsPlayed: sr?.events_count ?? 0,
          });
        }
        if (podEntries.length > 0) result.push({ podId: (pod as any).id, entries: podEntries });
      }
      return result;
    },
    async saveResults(_roundId, rows: ResultWrite[]) {
      if (rows.length === 0) return;
      const payload = rows.map((r) => ({
        entry_id: r.entryId,
        pod_id: r.podId,
        score: r.score,
        placement: r.placement,
        rating_delta: r.ratingDelta,
        rating_after: r.ratingAfter,
      }));
      await db.from('results').upsert(payload, { onConflict: 'entry_id' });
    },
    async saveRatingUpdates(_roundId, rows: RatingWrite[]) {
      if (rows.length === 0) return;
      const prov = DEFAULT_RATING_CONFIG.provisionalRounds;
      for (const r of rows) {
        const { data: sr } = await db
          .from('skill_ratings')
          .select('events_count')
          .eq('competitor_id', r.competitorId)
          .maybeSingle();
        const events = (sr?.events_count ?? 0) + 1;
        await db.from('skill_ratings').upsert(
          {
            competitor_id: r.competitorId,
            rating: r.ratingAfter,
            events_count: events,
            provisional: events < prov,
            last_event_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'competitor_id' },
        );
        await db.from('rating_history').insert({
          competitor_id: r.competitorId,
          rating_before: r.ratingBefore,
          rating_after: r.ratingAfter,
          k_factor: r.k, // K is 8/4 on the 0-100 scale; ensure the column is numeric(5,3)+
        });
      }
    },

    // ---------- distribute ----------
    async getResultsForShipping(roundId) {
      const { data } = await db
        .from('results')
        .select('entry_id, placement, entries!inner(round_id, event, competitor_id, competitors(first_name, last_name, school_id))')
        .eq('entries.round_id', roundId);
      return (data ?? []).map((r: any): ResultRow => ({
        entryId: r.entry_id,
        competitorId: r.entries?.competitor_id,
        competitorName: `${r.entries?.competitors?.first_name ?? ''} ${r.entries?.competitors?.last_name ?? ''}`.trim(),
        schoolId: r.entries?.competitors?.school_id ?? '',
        event: r.entries?.event,
        placement: r.placement,
      }));
    },
    async getSchools(_roundId) {
      const { data } = await db.from('schools').select('id, name, address');
      const out: Record<string, { name: string; address?: unknown }> = {};
      for (const s of data ?? []) out[(s as any).id] = { name: (s as any).name, address: (s as any).address };
      return out;
    },
    async saveShipList(roundId, list) {
      await db.from('round_step_runs').upsert(
        { round_id: roundId, step: 'distribute', status: 'done', detail: list as any, completed_at: new Date().toISOString() },
        { onConflict: 'round_id,step' },
      );
    },
  };
}

// ----------------------- round-controller entry -----------------------
// =====================================================================
// NMAO Tournament Engine — round-controller edge function (Deno / Edge)
// One entrypoint that runs a named pipeline step (or the whole tail) for a
// round. Every step is idempotent and keyed by (round_id, step), so this
// is safe to invoke from a schedule, a retry, or an operator button.
//
// POST body: { "roundId": "<uuid>", "step": "assign_judges" | "resolve" |
//              "distribute" | "tail" }
//
// Deploy: supabase functions deploy round-controller
// =====================================================================

// deno-lint-ignore-file no-explicit-any

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  let body: { roundId?: string; step?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { roundId, step } = body;
  if (!roundId || !step) return json({ error: 'roundId and step are required' }, 400);

  const store = createSupabaseStore();

  try {
    let outcome;
    switch (step) {
      case 'assign_judges': outcome = await stepAssignJudges(store, roundId); break;
      case 'resolve':       outcome = await stepResolve(store, roundId); break;
      case 'distribute':    outcome = await stepDistribute(store, roundId); break;
      case 'tail':          outcome = await runPipelineTail(store, roundId); break;
      default:              return json({ error: `unknown step: ${step}` }, 400);
    }
    return json({ ok: true, roundId, step, outcome });
  } catch (err) {
    return json({ ok: false, roundId, step, error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
