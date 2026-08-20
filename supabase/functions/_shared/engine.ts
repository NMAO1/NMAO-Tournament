// =====================================================================
// NMAO Tournament Engine — orchestration layer (spec §14)
// Each pipeline step is an idempotent operation keyed by (round_id, step)
// via round_step_runs. Steps read/write through an EngineStore interface,
// so the same orchestration runs against Supabase in production and an
// in-memory store in tests. The pure cores (assignments, rating, distribute)
// do all the real logic.
// =====================================================================

import { assignJudges, JudgeInput, AssignPod, Assignment } from './assignments.ts';
import { resolvePod, updateRatings, PodEntry, RatingState, RatingConfig, DEFAULT_RATING_CONFIG } from './rating.ts';
import { buildShipList, ResultRow } from './distribute.ts';
import { runDivisioning, Scheme, Entry, DivisioningResult } from './divisioning.ts';

export type StepName = 'divide' | 'assign_judges' | 'resolve' | 'distribute';
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

// The idempotency ledger every step reads/writes (round_step_runs). Split out
// so both EngineStore and DivisionStore share the claim machinery without the
// in-memory engine tests needing to know about divisioning.
export interface StepLedger {
  getStepStatus(roundId: string, step: StepName): Await<StepStatus | null>;
  setStepStatus(roundId: string, step: StepName, status: StepStatus, detail?: unknown): Await<void>;
  // Atomically claim a step: returns true only for the caller that wins the
  // claim (see the claim_step() SQL). Used to serialize concurrent runs.
  claimStep(roundId: string, step: StepName): Await<boolean>;
}

export interface EngineStore extends StepLedger {
  // How many assigned judge seats in this round have NOT submitted a score yet.
  // resolve/distribute refuse to run while this is > 0 (judging incomplete),
  // so no path can lock in placements from a half-judged round.
  unsubmittedSeatCount(roundId: string): Await<number>;
  // How many VALID entries in this round have NO judge assigned at all (e.g. a
  // pod whose every eligible judge was conflicted out). Those have no seat rows,
  // so the seat check above can't see them — resolve/distribute refuse while > 0
  // so their competitors never get silently dropped from placements/medals.
  unassignedEntryCount(roundId: string): Await<number>;

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

// Idempotency wrapper. Claims the step ATOMICALLY (claim_step): only the
// winning caller runs the work; a concurrent/duplicate call sees the step is
// already 'running' or 'done' and no-ops. Errors mark the step 'error' (which
// is claimable again, so a retry can re-run it). This closes the read-then-set
// race the previous version had.
async function idempotent(
  store: StepLedger,
  roundId: string,
  step: StepName,
  work: () => Promise<{ flags: string[]; detail?: unknown }>,
): Promise<StepOutcome> {
  const claimed = await store.claimStep(roundId, step);
  if (!claimed) {
    const status = await store.getStepStatus(roundId, step);
    return { step, ran: false, flags: [], detail: status === 'done' ? 'already done' : 'in flight' };
  }

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
    // Judging must be COMPLETE before we resolve — otherwise partial/empty pods
    // get placements locked in and the step marks itself done (unrecoverable).
    // This runs on every path (direct step, tail, all), which the HTTP-level
    // guard cannot (tail/all create the seats mid-run).
    const pending = await store.unsubmittedSeatCount(roundId);
    if (pending > 0) throw new Error(`Cannot resolve: ${pending} judge seat(s) haven't submitted a score yet — judging is incomplete.`);
    const unassigned = await store.unassignedEntryCount(roundId);
    if (unassigned > 0) throw new Error(`Cannot resolve: ${unassigned} valid entr${unassigned === 1 ? 'y has' : 'ies have'} no judge assigned — run assign judges / Fill unclaimed first.`);

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
    // Same judging-complete precondition — distribute would silently skip
    // unscored pods and hand out no medals for them. Covers tail/all too.
    const pending = await store.unsubmittedSeatCount(roundId);
    if (pending > 0) throw new Error(`Cannot distribute: ${pending} judge seat(s) haven't submitted a score yet — judging is incomplete.`);
    const unassigned = await store.unassignedEntryCount(roundId);
    if (unassigned > 0) throw new Error(`Cannot distribute: ${unassigned} valid entr${unassigned === 1 ? 'y has' : 'ies have'} no judge assigned — run assign judges / Fill unclaimed first.`);

    const results = await store.getResultsForShipping(roundId);
    const schools = await store.getSchools(roundId);
    const list = buildShipList(results, schools);
    await store.saveShipList(roundId, list);
    return { flags: [], detail: { shipments: list.shipments.length, medals: list.totalMedals } };
  });
}

// ---------- step: divide (classify -> collapse -> form pods, then persist) ----------
// The three divisioning sub-steps are one pure function (runDivisioning); we
// run them together and persist divisions/pods/entry assignments in a single
// idempotent 'divide' step. It uses its own DivisionStore seam so the in-memory
// engine orchestration tests (which don't exercise divisioning) are unaffected.
export interface DivisionStore extends StepLedger {
  getSchemeForRound(roundId: string): Await<Scheme>;
  getEntriesForDivision(roundId: string): Await<Entry[]>;
  saveDivisioning(
    roundId: string,
    result: DivisioningResult,
  ): Await<{ divisions: number; pods: number; assigned: number }>;
}

export function stepDivide(store: DivisionStore, roundId: string): Promise<StepOutcome> {
  return idempotent(store, roundId, 'divide', async () => {
    const scheme = await store.getSchemeForRound(roundId);
    const entries = await store.getEntriesForDivision(roundId);
    const result = runDivisioning(entries, scheme);
    const counts = await store.saveDivisioning(roundId, result);
    return { flags: result.flags, detail: counts };
  });
}

// ---------- controller: run the tail of the pipeline in order ----------
// (divide runs first; assign_judges -> resolve -> distribute are the tail.)
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
