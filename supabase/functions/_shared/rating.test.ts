// Unit tests for the locked resolve + rating core. Run: tsx rating.test.ts
// Pins the worked examples in docs/scoring-and-rating.md.
import { resolvePod, updateRatings, DEFAULT_RATING_CONFIG, PodEntry, PodResult, RatingState } from './rating.ts';

let passed = 0, failed = 0; const fails: string[] = [];
function ok(c: boolean, m: string) { if (c) passed++; else { failed++; fails.push(m); } }
function approx(a: number, b: number, eps = 0.02) { return Math.abs(a - b) <= eps; }

// ================= resolvePod =================
// straight average of judge scores
{
  const r = resolvePod([{ entryId: 'e', competitorId: 'c', rank: 'advanced', judgeScores: [80, 90, 85], submittedAt: 1 }]);
  ok(approx(r[0].score, 85), '3-judge straight average 80/90/85 = 85');
}
// placement by score desc
{
  const pod: PodEntry[] = [
    { entryId: 'a', competitorId: 'a', rank: 'beginner', judgeScores: [70], submittedAt: 1 },
    { entryId: 'b', competitorId: 'b', rank: 'beginner', judgeScores: [90], submittedAt: 1 },
    { entryId: 'c', competitorId: 'c', rank: 'beginner', judgeScores: [80], submittedAt: 1 },
  ];
  const r = resolvePod(pod);
  ok(r.find(x => x.entryId === 'b')!.placement === 1, 'highest score = 1st');
  ok(r.find(x => x.entryId === 'a')!.placement === 3, 'lowest score = 3rd');
}
// tiebreak 1: highest single-judge score
{
  const pod: PodEntry[] = [
    { entryId: 'x', competitorId: 'x', rank: 'advanced', judgeScores: [70, 70, 70], submittedAt: 1 }, // avg70 high70
    { entryId: 'y', competitorId: 'y', rank: 'advanced', judgeScores: [90, 60, 60], submittedAt: 1 }, // avg70 high90
  ];
  ok(resolvePod(pod).find(x => x.entryId === 'y')!.placement === 1, 'equal avg -> higher single-judge wins');
}
// tiebreak 2: earliest submission
{
  const pod: PodEntry[] = [
    { entryId: 'late', competitorId: 'l', rank: 'advanced', judgeScores: [90, 60, 60], submittedAt: 500 },
    { entryId: 'early', competitorId: 'e', rank: 'advanced', judgeScores: [90, 60, 60], submittedAt: 200 },
  ];
  ok(resolvePod(pod).find(x => x.entryId === 'early')!.placement === 1, 'full tie -> earliest submission wins');
}

// ================= updateRatings =================
// helper to build a resolved pod of same-rank entries at rating 50 in placement order
function evenPod(n: number, rank = 'beginner'): PodResult[] {
  return Array.from({ length: n }, (_, i) => ({
    entryId: 'e' + i, competitorId: 'c' + i, rank, score: 100 - i, topJudge: 100 - i, submittedAt: 1, placement: i + 1,
  }));
}
function states(ids: string[], rating = 50, roundsPlayed = 0): Record<string, RatingState> {
  const s: Record<string, RatingState> = {}; ids.forEach(id => s[id] = { rating, roundsPlayed }); return s;
}

// Worked example A: even 5-pod, all 50, provisional K=8 -> +4/+2/0/-2/-4
{
  const results = evenPod(5);
  const ch = updateRatings(results, states(results.map(r => r.competitorId), 50, 0));
  ok(approx(ch['c0'].delta, 4), `A 1st = +4 (got ${ch['c0'].delta})`);
  ok(approx(ch['c1'].delta, 2), `A 2nd = +2 (got ${ch['c1'].delta})`);
  ok(approx(ch['c2'].delta, 0), `A 3rd = 0 (got ${ch['c2'].delta})`);
  ok(approx(ch['c3'].delta, -2), `A 4th = -2 (got ${ch['c3'].delta})`);
  ok(approx(ch['c4'].delta, -4), `A 5th = -4 (got ${ch['c4'].delta})`);
  ok(ch['c0'].opponents === 4 && ch['c0'].k === 8, 'A records opponents=4, K=8');
}
// steady round (K=4) halves the movement
{
  const results = evenPod(5);
  const ch = updateRatings(results, states(results.map(r => r.competitorId), 50, 3));
  ok(approx(ch['c0'].delta, 2) && ch['c0'].k === 4, 'steady K=4: 1st = +2');
}

// Worked example B: field strength — upset gains far more than an expected win
{
  // A rated 70 beats B rated 50 (A 1st)
  const res: PodResult[] = [
    { entryId: 'A', competitorId: 'A', rank: 'beginner', score: 90, topJudge: 90, submittedAt: 1, placement: 1 },
    { entryId: 'B', competitorId: 'B', rank: 'beginner', score: 80, topJudge: 80, submittedAt: 1, placement: 2 },
  ];
  const st = { A: { rating: 70, roundsPlayed: 0 }, B: { rating: 50, roundsPlayed: 0 } };
  const expectedWin = updateRatings(res, st)['A'].delta;
  // B upsets A (B 1st)
  const res2: PodResult[] = [
    { entryId: 'B', competitorId: 'B', rank: 'beginner', score: 90, topJudge: 90, submittedAt: 1, placement: 1 },
    { entryId: 'A', competitorId: 'A', rank: 'beginner', score: 80, topJudge: 80, submittedAt: 1, placement: 2 },
  ];
  const upset = updateRatings(res2, st)['B'].delta;
  ok(approx(expectedWin, 1.92, 0.05), `B expected-win gain ~+1.9 (got ${expectedWin.toFixed(2)})`);
  ok(approx(upset, 6.08, 0.05), `B upset gain ~+6.1 (got ${upset.toFixed(2)})`);
  ok(upset > expectedWin, 'beating a stronger opponent is worth more');
}

// Worked example C: collapse — rating moves only on SAME-RANK comparisons
{
  // 2 beginners + 2 intermediates, all 50. Order: Bg1(1), In1(2), Bg2(3), In2(4)
  const res: PodResult[] = [
    { entryId: 'Bg1', competitorId: 'Bg1', rank: 'beginner', score: 90, topJudge: 90, submittedAt: 1, placement: 1 },
    { entryId: 'In1', competitorId: 'In1', rank: 'intermediate', score: 85, topJudge: 85, submittedAt: 1, placement: 2 },
    { entryId: 'Bg2', competitorId: 'Bg2', rank: 'beginner', score: 80, topJudge: 80, submittedAt: 1, placement: 3 },
    { entryId: 'In2', competitorId: 'In2', rank: 'intermediate', score: 75, topJudge: 75, submittedAt: 1, placement: 4 },
  ];
  const ch = updateRatings(res, states(['Bg1', 'In1', 'Bg2', 'In2'], 50, 0));
  ok(ch['Bg1'].opponents === 1, 'C Bg1 compared only against the other beginner');
  ok(approx(ch['Bg1'].delta, 4), `C Bg1 beats Bg2 -> +4 -> 54 (got ${ch['Bg1'].delta})`);
  ok(approx(ch['In2'].delta, -4), 'C In2 loses to In1 -> -4');
}

// lone-rank competitor does not move
{
  const res: PodResult[] = [
    { entryId: 'lone', competitorId: 'lone', rank: 'beginner', score: 90, topJudge: 90, submittedAt: 1, placement: 1 },
    { entryId: 'i1', competitorId: 'i1', rank: 'intermediate', score: 80, topJudge: 80, submittedAt: 1, placement: 2 },
    { entryId: 'i2', competitorId: 'i2', rank: 'intermediate', score: 70, topJudge: 70, submittedAt: 1, placement: 3 },
  ];
  const ch = updateRatings(res, states(['lone', 'i1', 'i2'], 50, 0));
  ok(ch['lone'].delta === 0 && ch['lone'].opponents === 0, 'lone-rank competitor does not move');
}

// clamp: rating cannot exceed max
{
  const res = evenPod(2);
  const ch = updateRatings(res, states(res.map(r => r.competitorId), 99.5, 0));
  ok(ch['c0'].after <= DEFAULT_RATING_CONFIG.ratingMax, 'rating clamped at max');
}

// new competitor seeds at 50
{
  const res = evenPod(2);
  const ch = updateRatings(res, {}); // no states -> all seed 50
  ok(ch['c0'].before === 50, 'unseen competitor starts at 50');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('All rating tests passed.');
