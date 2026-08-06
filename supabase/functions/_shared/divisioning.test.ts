// Unit tests for the divisioning core. Run: tsx divisioning.test.ts
import { classify, collapse, formPods, runDivisioning, Scheme, Entry } from './divisioning.ts';

// ---- tiny test harness ----
let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; fails.push(msg); }
}
function eq(a: unknown, b: unknown, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
}

// ---- season-1 scheme (locked values) ----
const scheme: Scheme = {
  axes: [
    { key: 'age', type: 'bracket', active: true, mergeable: true, brackets: [
      { key: '7-9', min: 7, max: 9 }, { key: '10-12', min: 10, max: 12 },
      { key: '13-15', min: 13, max: 15 }, { key: '16-17', min: 16, max: 17 },
      { key: '18+', min: 18, max: 200 },
    ] },
    { key: 'rank', type: 'tier', active: true, mergeable: true, tiers: ['beginner', 'intermediate', 'advanced'] },
    { key: 'event', type: 'category', active: true, mergeable: false, values: ['forms', 'weapons'] },
  ],
  podCap: 20, podSplitThreshold: 22, podFloor: 6, collapseOrder: ['rank', 'age'],
};

let seqCounter = 0;
function mk(event: string, age: string, rank: string, count: number, baseRating = 50): Entry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${event}-${age}-${rank}-${++seqCounter}`,
    event, ageBracket: age, rank, rating: baseRating + i,
  }));
}

// ---- Test 1: classify groups by (event, age, rank) ----
{
  const entries = [...mk('forms', '7-9', 'beginner', 3), ...mk('forms', '7-9', 'advanced', 2), ...mk('weapons', '7-9', 'beginner', 4)];
  const d = classify(entries, scheme);
  eq(d.length, 3, 'T1 three base divisions');
  ok(d.every((x) => !x.isCollapsed), 'T1 none collapsed yet');
}

// ---- Test 2: thin rank tiers collapse together, viable one stays ----
{
  const entries = [
    ...mk('forms', '10-12', 'beginner', 3),
    ...mk('forms', '10-12', 'intermediate', 4),
    ...mk('forms', '10-12', 'advanced', 10),
  ];
  const d = collapse(classify(entries, scheme), scheme);
  // beginner(3)+intermediate(4)=7 >= floor 6 merge; advanced(10) stays
  const merged = d.find((x) => x.isCollapsed);
  const solo = d.find((x) => !x.isCollapsed);
  eq(d.length, 2, 'T2 two divisions after collapse');
  ok(!!merged && merged.entries.length === 7, 'T2 merged beginner+intermediate = 7');
  ok(!!merged && merged.rankKey.includes('beginner') && merged.rankKey.includes('intermediate'), 'T2 merged rankKey composite');
  ok(!!solo && solo.rankKey === 'advanced' && solo.entries.length === 10, 'T2 advanced stands alone');
}

// ---- Test 3: never merge across events ----
{
  const entries = [...mk('forms', '13-15', 'beginner', 2), ...mk('weapons', '13-15', 'beginner', 3)];
  const d = collapse(classify(entries, scheme), scheme);
  eq(d.length, 2, 'T3 two divisions (events never merge)');
  ok(d.every((x) => x.underFloorUnmergeable === true), 'T3 both flagged under-floor unmergeable');
  ok(d.every((x) => !x.isCollapsed), 'T3 neither collapsed');
}

// ---- Test 4: cascade — thin ranks then thin age merges across age ----
{
  // 7-9 beginner(2), 7-9 intermediate(2)  -> 4, still < 6
  // 10-12 beginner(3) adjacent by age to 7-9 beginner
  const entries = [
    ...mk('forms', '7-9', 'beginner', 2),
    ...mk('forms', '7-9', 'intermediate', 2),
    ...mk('forms', '10-12', 'beginner', 3),
  ];
  const d = collapse(classify(entries, scheme), scheme);
  const total = d.reduce((s, x) => s + x.entries.length, 0);
  eq(total, 7, 'T4 all 7 entries preserved');
  // everything should end in one collapsed division of 7 (>= floor)
  const viable = d.filter((x) => x.entries.length >= scheme.podFloor);
  ok(viable.length === 1 && viable[0].entries.length === 7, 'T4 collapses to one viable division of 7');
}

// ---- Test 5: pod formation — single pod below split threshold ----
{
  const d = collapse(classify(mk('forms', '18+', 'beginner', 21), scheme), scheme);
  const pods = formPods(d[0], scheme);
  eq(pods.length, 1, 'T5 21 entries -> 1 pod (below split threshold 22)');
  eq(pods[0].entries.length, 21, 'T5 pod holds all 21');
}

// ---- Test 6: pod split at threshold (22 -> two balanced pods) ----
{
  const d = collapse(classify(mk('forms', '18+', 'beginner', 22), scheme), scheme);
  const pods = formPods(d[0], scheme);
  eq(pods.length, 2, 'T6 22 entries -> 2 pods');
  eq(pods.map((p) => p.entries.length), [11, 11], 'T6 balanced 11/11 (not 20/2)');
}

// ---- Test 7: large division -> evenly balanced pods, rating-banded ----
{
  const d = collapse(classify(mk('forms', '18+', 'intermediate', 45, 10), scheme), scheme);
  const pods = formPods(d[0], scheme);
  eq(pods.length, 3, 'T7 45 entries -> 3 pods');
  eq(pods.map((p) => p.entries.length), [15, 15, 15], 'T7 balanced 15/15/15');
  const top1 = Math.min(...pods[0].entries.map((e) => e.rating));
  const top2 = Math.max(...pods[1].entries.map((e) => e.rating));
  ok(top1 >= top2, 'T7 pod 1 ratings all >= pod 2 (rating-banded)');
}

// ---- Test 8: judge count by rank ----
{
  const beg = collapse(classify(mk('forms', '16-17', 'beginner', 8), scheme), scheme);
  const adv = collapse(classify(mk('forms', '16-17', 'advanced', 8), scheme), scheme);
  eq(formPods(beg[0], scheme)[0].judgeCount, 1, 'T8 beginner pod -> 1 judge');
  eq(formPods(adv[0], scheme)[0].judgeCount, 3, 'T8 advanced pod -> 3 judges');
}

// ---- Test 9: collapsed division containing advanced -> 3 judges ----
{
  const entries = [...mk('forms', '13-15', 'intermediate', 2), ...mk('forms', '13-15', 'advanced', 3)];
  const d = collapse(classify(entries, scheme), scheme);
  const merged = d.find((x) => x.isCollapsed)!;
  eq(formPods(merged, scheme)[0].judgeCount, 3, 'T9 int+adv collapsed pod -> 3 judges');
}

// ---- Test 10: runDivisioning end-to-end with flags ----
{
  const entries = [
    ...mk('forms', '7-9', 'beginner', 25),   // -> 2 pods
    ...mk('weapons', '18+', 'advanced', 1),  // lone, unmergeable -> flag
  ];
  const res = runDivisioning(entries, scheme);
  ok(res.pods.length >= 2, 'T10 produces pods');
  ok(res.flags.length === 1 && res.flags[0].includes('cannot collapse'), 'T10 flags the lone unmergeable division');
  const total = res.pods.reduce((s, p) => s + p.entries.length, 0);
  eq(total, 26, 'T10 every entry lands in exactly one pod');
}

// ---- report ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('All divisioning tests passed.');
