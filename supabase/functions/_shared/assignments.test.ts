// Unit tests for judge assignment. Run: tsx assignments.test.ts
import { assignJudges, JudgeInput, AssignPod } from './assignments.ts';

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(c: boolean, m: string) { if (c) passed++; else { failed++; fails.push(m); } }

const judges: JudgeInput[] = [
  { id: 'j1', schoolId: 'A' }, { id: 'j2', schoolId: 'A' },
  { id: 'j3', schoolId: 'B' }, { id: 'j4', schoolId: 'B' },
  { id: 'j5', schoolId: 'C' }, { id: 'j6', schoolId: 'C' },
];

// ---- own-school conflict excluded (1-judge pod) ----
{
  const pods: AssignPod[] = [{ podId: 'p1', judgeCount: 1, entries: [
    { entryId: 'e1', competitorId: 'c1', schoolId: 'A' },
  ] }];
  const { assignments } = assignJudges(pods, judges);
  const assigned = assignments[0].judgeIds;
  ok(assigned.length === 1, 'A1 one judge assigned');
  ok(!['j1', 'j2'].includes(assigned[0]), 'A1 no judge from the competitor\'s own school (A)');
}

// ---- advanced pod: 3 distinct judges, none own-school ----
{
  const pods: AssignPod[] = [{ podId: 'p2', judgeCount: 3, entries: [
    { entryId: 'e2', competitorId: 'c2', schoolId: 'A' },
  ] }];
  const { assignments } = assignJudges(pods, judges);
  const a = assignments[0].judgeIds;
  ok(a.length === 3, 'A2 three judges for advanced');
  ok(new Set(a).size === 3, 'A2 three distinct judges');
  ok(a.every((id) => id === 'j3' || id === 'j4' || id === 'j5' || id === 'j6'), 'A2 none from school A');
}

// ---- per-pod: whole pod shares ONE panel; load balances across PODS ----
{
  // 5 entries in a single 1-judge pod -> all scored by the SAME judge
  const onePod: AssignPod[] = [{ podId: 'p3', judgeCount: 1,
    entries: Array.from({ length: 5 }, (_, i) => ({ entryId: 'e' + i, competitorId: 'c' + i, schoolId: 'A' })) }];
  const r1 = assignJudges(onePod, judges);
  ok(r1.assignments.length === 5, 'A3 5 entries -> 5 assignment rows');
  ok(new Set(r1.assignments.map((a) => a.judgeIds[0])).size === 1, 'A3 all entries in a pod share ONE judge');
  ok(!['j1', 'j2'].includes(r1.assignments[0].judgeIds[0]), 'A3 own-school (A) judge never used');

  // 4 separate 1-judge pods -> load spreads one pod per eligible judge (j3-j6)
  const fourPods: AssignPod[] = Array.from({ length: 4 }, (_, i) => ({
    podId: 'q' + i, judgeCount: 1, entries: [{ entryId: 'x' + i, competitorId: 'y' + i, schoolId: 'A' }],
  }));
  const counts: Record<string, number> = {};
  assignJudges(fourPods, judges).assignments.forEach((a) => a.judgeIds.forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  ok(['j3', 'j4', 'j5', 'j6'].every((id) => counts[id] === 1), 'A3 load balances one pod per eligible judge');
  ok(!counts['j1'] && !counts['j2'], 'A3 own-school judges never used across pods');
}

// ---- pod-level conflict: a judge from ANY pod school is excluded ----
{
  const pods: AssignPod[] = [{ podId: 'p6', judgeCount: 1, entries: [
    { entryId: 'm1', competitorId: 'cm1', schoolId: 'A' },
    { entryId: 'm2', competitorId: 'cm2', schoolId: 'B' },
  ] }];
  const { assignments } = assignJudges(pods, judges);
  const used = assignments[0].judgeIds[0];
  ok(!['j1', 'j2', 'j3', 'j4'].includes(used), 'A6 judge from neither pod school (A nor B) is used');
  ok(assignments.every((a) => a.judgeIds[0] === used), 'A6 both entries share the same clean judge');
}

// ---- shortfall flagged when too few eligible ----
{
  // competitor at school B, but only school-B judges exist -> 0 eligible
  const onlyB: JudgeInput[] = [{ id: 'b1', schoolId: 'B' }, { id: 'b2', schoolId: 'B' }];
  const pods: AssignPod[] = [{ podId: 'p4', judgeCount: 3, entries: [
    { entryId: 'e4', competitorId: 'c4', schoolId: 'B' },
  ] }];
  const { assignments, flags } = assignJudges(pods, onlyB);
  ok(assignments[0].judgeIds.length === 0 && assignments[0].shortfall === 3, 'A4 zero eligible -> shortfall 3');
  ok(flags.length === 1 && flags[0].includes('p4'), 'A4 shortfall flagged for operator (per pod)');
}

// ---- partial shortfall (advanced pod, only 2 eligible) ----
{
  const twoOther: JudgeInput[] = [
    { id: 'x1', schoolId: 'A' }, // own school, excluded
    { id: 'x2', schoolId: 'B' }, { id: 'x3', schoolId: 'C' },
  ];
  const pods: AssignPod[] = [{ podId: 'p5', judgeCount: 3, entries: [
    { entryId: 'e5', competitorId: 'c5', schoolId: 'A' },
  ] }];
  const { assignments, flags } = assignJudges(pods, twoOther);
  ok(assignments[0].judgeIds.length === 2 && assignments[0].shortfall === 1, 'A5 2 eligible for a 3-judge pod -> shortfall 1');
  ok(flags.length === 1, 'A5 partial shortfall flagged');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('All assignment tests passed.');
