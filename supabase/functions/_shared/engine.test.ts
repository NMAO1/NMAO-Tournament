// End-to-end orchestration tests with an in-memory store. Run: tsx engine.test.ts
import {
  EngineStore, StepName, StepStatus, PodForResolve, ResultWrite, RatingWrite,
  stepAssignJudges, stepResolve, stepDistribute, runPipelineTail,
} from './engine.ts';
import { AssignPod, JudgeInput, Assignment } from './assignments.ts';
import { ResultRow } from './distribute.ts';

let passed = 0, failed = 0; const fails: string[] = [];
function ok(cond: boolean, msg: string) { if (cond) passed++; else { failed++; fails.push(msg); } }
function approx(a: number, b: number, eps = 0.02) { return Math.abs(a - b) <= eps; }

// ---- a tiny in-memory EngineStore for one round ----
class MemStore implements EngineStore {
  steps = new Map<string, StepStatus>();
  assignments: Assignment[] = [];
  results: ResultWrite[] = [];
  ratings: RatingWrite[] = [];
  shipList: any = null;
  saveCounts = { assignments: 0, results: 0, ratings: 0, ship: 0 };

  constructor(
    private assignPods: AssignPod[],
    private judges: JudgeInput[],
    private pods: PodForResolve[],
    private resultRows: ResultRow[],
    private schools: Record<string, { name: string; address?: unknown }>,
  ) {}

  unsubmittedSeatCount() { return 0; } // test scenarios pre-fill all judge scores
  unassignedEntryCount() { return 0; } // and every entry is judged
  getStepStatus(r: string, s: StepName) { return this.steps.get(`${r}:${s}`) ?? null; }
  setStepStatus(r: string, s: StepName, st: StepStatus) { this.steps.set(`${r}:${s}`, st); }
  claimStep(r: string, s: StepName) {
    const cur = this.steps.get(`${r}:${s}`);
    if (cur === 'running' || cur === 'done') return false; // already held or finished
    this.steps.set(`${r}:${s}`, 'running');
    return true;
  }

  getPodsForAssignment() { return this.assignPods; }
  getJudgePool() { return this.judges; }
  saveAssignments(_r: string, a: Assignment[]) { this.assignments = a; this.saveCounts.assignments++; }

  getPodsForResolve() { return this.pods; }
  saveResults(_r: string, rows: ResultWrite[]) { this.results = rows; this.saveCounts.results++; }
  saveRatingUpdates(_r: string, rows: RatingWrite[]) { this.ratings = rows; this.saveCounts.ratings++; }

  getResultsForShipping() { return this.resultRows; }
  getSchools() { return this.schools; }
  saveShipList(_r: string, list: any) { this.shipList = list; this.saveCounts.ship++; }
}

// ---- scenario: one advanced pod (3 judges) of three same-rank competitors ----
const assignPods: AssignPod[] = [{
  podId: 'p1', judgeCount: 3, entries: [
    { entryId: 'e1', competitorId: 'c1', schoolId: 's1' },
    { entryId: 'e2', competitorId: 'c2', schoolId: 's2' },
    { entryId: 'e3', competitorId: 'c3', schoolId: 's3' },
  ],
}];
// Pod p1 holds entries from s1/s2/s3; per-pod conflict exclusion means the panel
// must come from OTHER schools, so the pool needs >=3 judges outside s1/s2/s3.
const judges: JudgeInput[] = [
  { id: 'j1', schoolId: 's1' }, { id: 'j2', schoolId: 's2' },
  { id: 'j3', schoolId: 's3' }, { id: 'j4', schoolId: 's4' },
  { id: 'j5', schoolId: 's5' }, { id: 'j6', schoolId: 's6' },
];
const pods: PodForResolve[] = [{
  podId: 'p1',
  entries: [
    { entryId: 'e1', competitorId: 'c1', rank: 'advanced', judgeScores: [90, 90, 90], submittedAt: 100, schoolId: 's1', competitorName: 'Ann', event: 'forms', rating: 50, roundsPlayed: 5 },
    { entryId: 'e2', competitorId: 'c2', rank: 'advanced', judgeScores: [70, 70, 70], submittedAt: 100, schoolId: 's2', competitorName: 'Bo',  event: 'forms', rating: 50, roundsPlayed: 5 },
    { entryId: 'e3', competitorId: 'c3', rank: 'advanced', judgeScores: [50, 50, 50], submittedAt: 100, schoolId: 's3', competitorName: 'Cy',  event: 'forms', rating: 50, roundsPlayed: 5 },
  ],
}];
const resultRows: ResultRow[] = [
  { entryId: 'e1', competitorId: 'c1', competitorName: 'Ann', schoolId: 's1', event: 'forms', placement: 1 },
  { entryId: 'e2', competitorId: 'c2', competitorName: 'Bo',  schoolId: 's2', event: 'forms', placement: 2 },
  { entryId: 'e3', competitorId: 'c3', competitorName: 'Cy',  schoolId: 's3', event: 'forms', placement: 3 },
];
const schools = { s1: { name: 'Dojo1' }, s2: { name: 'Dojo2' }, s3: { name: 'Dojo3' } };

async function main() {
// ---- assign judges ----
{
  const store = new MemStore(assignPods, judges, pods, resultRows, schools);
  const out = await stepAssignJudges(store, 'r1');
  ok(out.ran === true, 'assign_judges runs first time');
  ok(store.assignments.length === 3, '3 videos -> 3 assignment rows');
  ok(store.assignments.every((a) => a.judgeIds.length === 3), 'each advanced video gets 3 judges');
  // per-pod: every entry in the pod shares the SAME panel (comparable scoring)
  const panel0 = JSON.stringify(store.assignments[0].judgeIds);
  ok(store.assignments.every((a) => JSON.stringify(a.judgeIds) === panel0), 'all pod entries get the SAME judge panel');
  ok(store.assignments[0].judgeIds.every((id) => ['j4', 'j5', 'j6'].includes(id)), 'panel excludes every pod school (s1/s2/s3)');
  const e1 = store.assignments.find((a) => a.entryId === 'e1')!;
  ok(!e1.judgeIds.includes('j1'), 'e1 (school s1) not judged by own-school judge j1');
  const out2 = await stepAssignJudges(store, 'r1');
  ok(out2.ran === false && store.saveCounts.assignments === 1, 'assign_judges idempotent (saved once)');
}

// ---- resolve + same-rank ratings ----
{
  const store = new MemStore(assignPods, judges, pods, resultRows, schools);
  const out = await stepResolve(store, 'r1');
  ok(out.ran === true, 'resolve runs');
  const e1 = store.results.find((r) => r.entryId === 'e1')!;
  const e3 = store.results.find((r) => r.entryId === 'e3')!;
  ok(e1.placement === 1 && approx(e1.score, 90), 'top scorer placed 1st with avg 90');
  ok(e3.placement === 3, 'low scorer placed 3rd');
  // 3 same-rank at 50, steady K=4: 1st +2, 2nd 0, 3rd -2
  ok(approx(e1.ratingDelta, 2), `1st rating delta +2 (got ${e1.ratingDelta})`);
  ok(approx(e3.ratingDelta, -2), `3rd rating delta -2 (got ${e3.ratingDelta})`);
  const r1 = store.ratings.find((r) => r.competitorId === 'c1')!;
  ok(r1.opponents === 2 && r1.k === 4, 'rating audit records opponents=2, K=4');
  const out2 = await stepResolve(store, 'r1');
  ok(out2.ran === false && store.saveCounts.results === 1, 'resolve idempotent (results saved once)');
}

// ---- distribute ----
{
  const store = new MemStore(assignPods, judges, pods, resultRows, schools);
  const out = await stepDistribute(store, 'r1');
  ok(out.ran === true, 'distribute runs');
  ok(store.shipList.shipments.length === 3, 'three schools -> three shipments');
  ok(store.shipList.totalMedals === 3 + 3, '3 participation + 3 placement medals = 6');
}

// ---- full tail + idempotent replay ----
{
  const store = new MemStore(assignPods, judges, pods, resultRows, schools);
  const first = await runPipelineTail(store, 'r1');
  ok(first.every((o) => o.ran), 'first full run executes all three steps');
  const replay = await runPipelineTail(store, 'r1');
  ok(replay.every((o) => !o.ran), 'replay runs nothing (all steps done)');
  ok(store.saveCounts.assignments === 1 && store.saveCounts.results === 1 && store.saveCounts.ship === 1,
     'each step persisted exactly once despite the replay');
}

// ---- guard: resolve/distribute refuse while judging is incomplete ----
{
  const s1 = new MemStore(assignPods, judges, pods, resultRows, schools);
  (s1 as any).unsubmittedSeatCount = () => 3;
  let threw = false;
  try { await stepResolve(s1, 'rGuardA'); } catch { threw = true; }
  ok(threw, 'resolve refuses while judge seats are unsubmitted');
  ok(s1.saveCounts.results === 0, 'no results written when judging incomplete');

  const s2 = new MemStore(assignPods, judges, pods, resultRows, schools);
  (s2 as any).unassignedEntryCount = () => 1;
  let threw2 = false;
  try { await stepDistribute(s2, 'rGuardB'); } catch { threw2 = true; }
  ok(threw2, 'distribute refuses while a valid entry has no judge assigned');
  ok(s2.saveCounts.ship === 0, 'no ship list written when an entry is unjudged');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('All engine orchestration tests passed.');
}

main();
