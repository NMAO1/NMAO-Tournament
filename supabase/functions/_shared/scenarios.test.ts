// End-to-end edge-case scenarios across the pure cores. Run: tsx scenarios.test.ts
// These push past the happy-path demo round: pod splits, un-mergeable divisions,
// judge shortfalls, mixed-rank pods, provisional vs steady K, clamp invariants.
import { runDivisioning, Scheme, Entry } from './divisioning.ts';
import { assignJudges, AssignPod, JudgeInput } from './assignments.ts';
import { resolvePod, updateRatings, weightedJudgeScore, PodEntry, RatingState, DEFAULT_RATING_CONFIG } from './rating.ts';
import { buildShipList, ResultRow } from './distribute.ts';

let passed = 0, failed = 0; const fails: string[] = [];
function ok(c: boolean, m: string) { if (c) passed++; else { failed++; fails.push(m); } }
function approx(a: number, b: number, eps = 0.01) { return Math.abs(a - b) <= eps; }

const scheme = (): Scheme => ({
  axes: [
    { key: 'age', type: 'bracket', active: true, mergeable: true, brackets: [
      { key: '7_9', min: 7, max: 9 }, { key: '10_12', min: 10, max: 12 },
      { key: '13_15', min: 13, max: 15 }, { key: '16_17', min: 16, max: 17 },
      { key: '18_plus', min: 18, max: 200 },
    ] },
    { key: 'rank', type: 'tier', active: true, mergeable: true, tiers: ['beginner', 'intermediate', 'advanced'] },
    { key: 'event', type: 'category', active: true, mergeable: false,
      values: ['trad_forms', 'open_forms', 'trad_weapons', 'open_weapons'] },
  ],
  podCap: 20, podSplitThreshold: 22, podFloor: 6, collapseOrder: ['rank', 'age'],
});
let uid = 0;
function ent(event: string, age: string, rank: string, rating = 50): Entry {
  return { id: `e${++uid}`, event, ageBracket: age, rank, rating };
}
function many(n: number, event: string, age: string, rank: string): Entry[] {
  return Array.from({ length: n }, (_, i) => ent(event, age, rank, 40 + i));
}

// ---- 1. pod split at the 22 threshold (cap 20) ----
{
  const r21 = runDivisioning(many(21, 'trad_forms', '10_12', 'advanced'), scheme());
  ok(r21.divisions.length === 1 && r21.pods.length === 1, '21 entries -> 1 pod (below split threshold)');
  const r22 = runDivisioning(many(22, 'trad_forms', '10_12', 'advanced'), scheme());
  ok(r22.pods.length === 2 && r22.pods.every((p) => p.entries.length === 11), '22 entries -> 2 pods of 11');
  const r24 = runDivisioning(many(24, 'trad_forms', '10_12', 'advanced'), scheme());
  ok(r24.pods.length === 2 && r24.pods.map((p) => p.entries.length).join(',') === '12,12', '24 -> 12/12');
  ok(r24.pods.every((p) => p.judgeCount === 3), 'advanced split pods keep 3 judges');
  const r42 = runDivisioning(many(42, 'trad_forms', '10_12', 'advanced'), scheme());
  ok(r42.pods.length === 3 && r42.pods.map((p) => p.entries.length).join(',') === '14,14,14', '42 -> 14/14/14');
}

// ---- 2. collapse on RANK, then fall back to AGE ----
{
  // rank merge: thin 13-15 advanced(3)+intermediate(4) -> one 7-entry pod, 3 judges
  const rankMerge = runDivisioning(
    [...many(3, 'trad_forms', '13_15', 'advanced'), ...many(4, 'trad_forms', '13_15', 'intermediate')], scheme());
  const cm = rankMerge.divisions.find((d) => d.isCollapsed);
  ok(rankMerge.divisions.length === 1 && !!cm && cm.entries.length === 7, 'rank-collapse -> single 7-entry division');
  ok(cm!.rankKey.includes('advanced') && cm!.rankKey.includes('intermediate'), 'collapsed rankKey spans both tiers');
  ok(rankMerge.pods.length === 1 && rankMerge.pods[0].judgeCount === 3, 'collapsed w/ advanced -> 3 judges, 1 pod');

  // age fallback: 7-9 beginner(2) has no rank neighbor -> merges with 10-12 beginner(5)
  const ageMerge = runDivisioning(
    [...many(2, 'trad_forms', '7_9', 'beginner'), ...many(5, 'trad_forms', '10_12', 'beginner')], scheme());
  const am = ageMerge.divisions.find((d) => d.isCollapsed);
  ok(ageMerge.divisions.length === 1 && !!am && am.entries.length === 7, 'age-collapse -> single 7-entry division');
  ok(am!.ageKey.includes('7_9') && am!.ageKey.includes('10_12'), 'collapsed ageKey spans both brackets');
  ok(ageMerge.pods[0].judgeCount === 1, 'beginner-only collapsed pod -> 1 judge');
}

// ---- 3. un-mergeable under-floor division is flagged, not dropped ----
{
  const r = runDivisioning(many(3, 'open_weapons', '18_plus', 'advanced'), scheme());
  const d = r.divisions[0];
  ok(r.divisions.length === 1 && d.entries.length === 3, 'isolated thin division survives');
  ok(d.underFloorUnmergeable === true, 'flagged underFloorUnmergeable (no legal neighbor)');
  ok(r.flags.length >= 1 && r.pods.length === 1, 'operator flag emitted; a pod still forms');
}

// ---- 4. events never merge across the mergeable:false axis ----
{
  const r = runDivisioning(
    [...many(3, 'trad_forms', '10_12', 'advanced'), ...many(3, 'open_forms', '10_12', 'advanced')], scheme());
  ok(r.divisions.length === 2, 'trad vs open stay separate (event never merges) even when both thin');
  ok(r.divisions.every((d) => d.underFloorUnmergeable), 'each remains under-floor + flagged');
}

// ---- 5. judge assignment: shortfall + own-school exclusion ----
{
  const pods: AssignPod[] = [{ podId: 'p1', judgeCount: 3, entries: [
    { entryId: 'e1', competitorId: 'c1', schoolId: 's1' },
    { entryId: 'e2', competitorId: 'c2', schoolId: 's1' },
    { entryId: 'e3', competitorId: 'c3', schoolId: 's1' },
  ] }];
  const judges: JudgeInput[] = [ { id: 'j1', schoolId: 's1' }, { id: 'j2', schoolId: 's1' },
    { id: 'j3', schoolId: 's2' }, { id: 'j4', schoolId: 's3' } ];
  const { assignments, flags } = assignJudges(pods, judges);
  ok(assignments.every((a) => a.judgeIds.length === 2 && a.shortfall === 1), 'only 2 eligible -> shortfall 1 each');
  ok(flags.length === 3, 'a flag per short-staffed video');
  ok(assignments.every((a) => !a.judgeIds.includes('j1') && !a.judgeIds.includes('j2')), 'no own-school (s1) judge used');

  // enough judges -> no shortfall, still no own-school judge
  const judges2: JudgeInput[] = [ { id: 'j3', schoolId: 's2' }, { id: 'j4', schoolId: 's3' }, { id: 'j5', schoolId: 's4' } ];
  const r2 = assignJudges(pods, judges2);
  ok(r2.flags.length === 0 && r2.assignments.every((a) => a.judgeIds.length === 3), 'enough cross-school judges -> full panels');
}

// ---- 6. resolve tiebreaks: top-judge, then earliest submission ----
{
  const res = resolvePod([
    { entryId: 'a', competitorId: 'ca', rank: 'advanced', judgeScores: [80, 80, 80], submittedAt: 100 }, // avg 80, top 80
    { entryId: 'b', competitorId: 'cb', rank: 'advanced', judgeScores: [90, 70, 80], submittedAt: 200 }, // avg 80, top 90
  ]);
  ok(res.find((r) => r.entryId === 'b')!.placement === 1, 'equal avg -> higher single-judge wins');

  const res2 = resolvePod([
    { entryId: 'x', competitorId: 'cx', rank: 'beginner', judgeScores: [70], submittedAt: 300 },
    { entryId: 'y', competitorId: 'cy', rank: 'beginner', judgeScores: [70], submittedAt: 100 }, // earlier
  ]);
  ok(res2.find((r) => r.entryId === 'y')!.placement === 1, 'equal avg + top -> earliest submission wins');
}

// ---- 7. mixed-rank pod: rating moves ONLY within rank; zero-sum at equal ratings ----
{
  const entries: PodEntry[] = [
    ...[95, 90, 85].map((s, i) => ({ entryId: `A${i}`, competitorId: `A${i}`, rank: 'advanced', judgeScores: [s, s, s], submittedAt: 1 })),
    ...[80, 75, 70, 65].map((s, i) => ({ entryId: `I${i}`, competitorId: `I${i}`, rank: 'intermediate', judgeScores: [s], submittedAt: 1 })),
  ];
  const states: Record<string, RatingState> = {};
  for (const e of entries) states[e.competitorId] = { rating: 50, roundsPlayed: 5 }; // steady K=4, equal ratings
  const ch = updateRatings(resolvePod(entries), states, DEFAULT_RATING_CONFIG);
  ok(['A0', 'A1', 'A2'].every((id) => ch[id].opponents === 2), 'advanced measured vs 2 same-rank only');
  ok(['I0', 'I1', 'I2', 'I3'].every((id) => ch[id].opponents === 3), 'intermediate measured vs 3 same-rank only');
  const advSum = ch.A0.delta + ch.A1.delta + ch.A2.delta;
  const intSum = ch.I0.delta + ch.I1.delta + ch.I2.delta + ch.I3.delta;
  ok(approx(advSum, 0) && approx(intSum, 0), 'each rank group is zero-sum at equal ratings');
  ok(approx(ch.A0.delta, 2) && approx(ch.A2.delta, -2), 'advanced winner +2 / last -2 (K=4)');
  ok(approx(ch.I0.delta, 2) && approx(ch.I3.delta, -2), 'intermediate winner +2 / last -2 (K=4)');
  ok(Object.values(ch).every((c) => c.after >= 0 && c.after <= 100), 'ratings stay clamped in [0,100]');
}

// ---- 8. lone rank in a collapsed pod does NOT move ----
{
  const entries: PodEntry[] = [
    { entryId: 'adv', competitorId: 'adv', rank: 'advanced', judgeScores: [99, 99, 99], submittedAt: 1 },
    ...[60, 55, 50].map((s, i) => ({ entryId: `b${i}`, competitorId: `b${i}`, rank: 'beginner', judgeScores: [s], submittedAt: 1 })),
  ];
  const states: Record<string, RatingState> = {};
  for (const e of entries) states[e.competitorId] = { rating: 50, roundsPlayed: 5 };
  const ch = updateRatings(resolvePod(entries), states, DEFAULT_RATING_CONFIG);
  ok(ch.adv.opponents === 0 && ch.adv.delta === 0, 'lone advanced has no same-rank peer -> no rating move');
  ok(ch.b0.delta > 0 && ch.b2.delta < 0, 'the beginners still move against each other');
}

// ---- 9. provisional K (first 3 rounds) moves faster than steady K ----
{
  const mk = (roundsPlayed: number) => {
    const entries: PodEntry[] = [
      { entryId: 'w', competitorId: 'w', rank: 'beginner', judgeScores: [80], submittedAt: 1 },
      { entryId: 'l', competitorId: 'l', rank: 'beginner', judgeScores: [60], submittedAt: 1 },
    ];
    const states: Record<string, RatingState> = { w: { rating: 50, roundsPlayed }, l: { rating: 50, roundsPlayed } };
    return updateRatings(resolvePod(entries), states, DEFAULT_RATING_CONFIG);
  };
  const prov = mk(0), steady = mk(5);
  ok(prov.w.k === 8 && steady.w.k === 4, 'K = 8 provisional, 4 steady');
  ok(approx(prov.w.delta, 4) && approx(steady.w.delta, 2), 'provisional winner +4 vs steady +2 (equal ratings)');
}

// ---- 10. distribute: medals + per-school grouping ----
{
  const results: ResultRow[] = [
    { entryId: 'e1', competitorId: 'c1', competitorName: 'Ann', schoolId: 's1', event: 'forms', placement: 1 },
    { entryId: 'e2', competitorId: 'c2', competitorName: 'Bo',  schoolId: 's2', event: 'forms', placement: 2 },
    { entryId: 'e3', competitorId: 'c3', competitorName: 'Cy',  schoolId: 's1', event: 'forms', placement: 3 },
    { entryId: 'e4', competitorId: 'c4', competitorName: 'Di',  schoolId: 's2', event: 'forms', placement: 4 },
  ];
  const list = buildShipList(results, { s1: { name: 'Dojo1' }, s2: { name: 'Dojo2' } });
  ok(list.shipments.length === 2, 'one shipment per school');
  ok(list.totalMedals === 4 + 3, '4 participation + 3 placement = 7 medals');
  const s1 = list.shipments.find((s) => s.schoolId === 's1')!;
  ok(s1.items.find((i) => i.competitorName === 'Ann')!.medals.includes('gold'), '1st place -> gold');
  ok(!results.some((r) => r.placement === 4) || !list.shipments.flatMap((s) => s.items).find((i) => i.placement === 4)!.medals.some((m) => m !== 'participation'), '4th place -> participation only');
}

// ---- 11. rating clamps at the 0 and 100 bounds ----
{
  const hi = updateRatings(resolvePod([
    { entryId: 'hi', competitorId: 'hi', rank: 'advanced', judgeScores: [99, 99, 99], submittedAt: 1 },
    { entryId: 'lo', competitorId: 'lo', rank: 'advanced', judgeScores: [10, 10, 10], submittedAt: 1 },
  ]), { hi: { rating: 97, roundsPlayed: 0 }, lo: { rating: 100, roundsPlayed: 0 } }, DEFAULT_RATING_CONFIG);
  ok(hi.hi.after === 100 && approx(hi.hi.delta, 3), 'win beyond 100 clamps to 100 (delta trimmed)');

  const lo = updateRatings(resolvePod([
    { entryId: 'a', competitorId: 'a', rank: 'beginner', judgeScores: [90], submittedAt: 1 },
    { entryId: 'b', competitorId: 'b', rank: 'beginner', judgeScores: [10], submittedAt: 1 },
  ]), { a: { rating: 0, roundsPlayed: 0 }, b: { rating: 3, roundsPlayed: 0 } }, DEFAULT_RATING_CONFIG);
  ok(lo.b.after === 0 && approx(lo.b.delta, -3), 'loss below 0 clamps to 0');
}

// ---- 12. large fields split into cap-sized pods ----
{
  const r100 = runDivisioning(many(100, 'trad_forms', '10_12', 'advanced'), scheme());
  ok(r100.pods.length === 5 && r100.pods.every((p) => p.entries.length === 20), '100 -> 5 pods of 20 (cap)');
  const r101 = runDivisioning(many(101, 'trad_forms', '10_12', 'advanced'), scheme());
  ok(r101.pods.length === 6 && r101.pods.map((p) => p.entries.length).join(',') === '17,17,17,17,17,16', '101 -> 17×5 + 16');
}

// ---- 13. determinism: identical input -> identical output ----
{
  const inp = () => [...many(15, 'trad_forms', '10_12', 'advanced'), ...many(8, 'open_forms', '13_15', 'beginner')];
  const key = (r: ReturnType<typeof runDivisioning>) =>
    r.pods.map((p) => p.divisionKey + ':' + p.entries.map((e) => e.rating).join('-')).sort().join('|');
  ok(key(runDivisioning(inp(), scheme())) === key(runDivisioning(inp(), scheme())), 'divisioning is deterministic');
  const pods: AssignPod[] = [{ podId: 'p', judgeCount: 3, entries: [
    { entryId: 'x', competitorId: 'x', schoolId: 's1' }, { entryId: 'y', competitorId: 'y', schoolId: 's2' }] }];
  const js: JudgeInput[] = [{ id: 'j1', schoolId: 's3' }, { id: 'j2', schoolId: 's4' }, { id: 'j3', schoolId: 's5' }];
  ok(JSON.stringify(assignJudges(pods, js)) === JSON.stringify(assignJudges(pods, js)), 'judge assignment is deterministic');
}

// ---- 14. exact-floor and single-entry divisions ----
{
  const floor6 = runDivisioning(many(6, 'trad_forms', '10_12', 'beginner'), scheme());
  ok(floor6.divisions.length === 1 && !floor6.divisions[0].underFloorUnmergeable && floor6.pods.length === 1,
     'exactly floor (6) -> valid single pod, no flag');
  const solo = runDivisioning(many(1, 'open_weapons', '18_plus', 'advanced'), scheme());
  ok(solo.divisions[0].underFloorUnmergeable === true && solo.pods[0].entries.length === 1, 'single isolated entry -> flagged 1-entry pod');
  ok(resolvePod([{ entryId: 's', competitorId: 's', rank: 'advanced', judgeScores: [88, 90, 86], submittedAt: 1 }])[0].placement === 1,
     'single-entry pod resolves to 1st');
}

// ---- 15. unknown competitor falls back to seed 50 + provisional K ----
{
  const ch = updateRatings(resolvePod([
    { entryId: 'n1', competitorId: 'n1', rank: 'beginner', judgeScores: [70], submittedAt: 1 },
    { entryId: 'n2', competitorId: 'n2', rank: 'beginner', judgeScores: [60], submittedAt: 1 },
  ]), {}, DEFAULT_RATING_CONFIG); // no states supplied
  ok(ch.n1.before === 50 && ch.n1.k === 8, 'no prior state -> seed 50, K=8');
  ok(approx(ch.n1.delta, 4) && approx(ch.n2.delta, -4), 'two brand-new beginners move +4 / -4');
}

// ---- 16. weighted per-criterion judge score (Traditional rubric) ----
{
  const w = [
    { criterionCode: 'technical', weightPct: 25 }, { criterionCode: 'power', weightPct: 20 },
    { criterionCode: 'balance', weightPct: 20 }, { criterionCode: 'timing', weightPct: 15 },
    { criterionCode: 'spirit', weightPct: 12 }, { criterionCode: 'difficulty', weightPct: 8 },
  ];
  ok(approx(weightedJudgeScore(w.map((x) => ({ criterionCode: x.criterionCode, rawScore: 80 })), w), 80), 'all criteria 80 -> 80');
  ok(approx(weightedJudgeScore([{ criterionCode: 'technical', rawScore: 90 }, { criterionCode: 'power', rawScore: 60 }], w),
     (90 * 25 + 60 * 20) / 45), 'partial rubric normalizes by weight present');
  ok(weightedJudgeScore([{ criterionCode: 'technical', rawScore: 200 }], w) === 100, 'out-of-range clamps to 100');
}

// ---- 17. judge count follows rank ----
{
  ok(runDivisioning(many(7, 'trad_forms', '10_12', 'beginner'), scheme()).pods[0].judgeCount === 1, 'beginner pod -> 1 judge');
  ok(runDivisioning(many(7, 'trad_forms', '10_12', 'intermediate'), scheme()).pods[0].judgeCount === 1, 'intermediate pod -> 1 judge');
  ok(runDivisioning(many(7, 'trad_forms', '10_12', 'advanced'), scheme()).pods[0].judgeCount === 3, 'advanced pod -> 3 judges');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('All edge-case scenario tests passed.');
