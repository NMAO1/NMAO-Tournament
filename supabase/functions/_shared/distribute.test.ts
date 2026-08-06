// Unit tests for distribute + round-state machine. Run: tsx distribute.test.ts
import { buildShipList, ResultRow } from './distribute.ts';
import { nextState, guardBlock, statesToClear, GuardContext } from './roundState.ts';

let passed = 0, failed = 0; const fails: string[] = [];
function ok(cond: boolean, msg: string) { if (cond) passed++; else { failed++; fails.push(msg); } }

// ================= distribute =================
const schools = { s1: { name: 'Dragon Dojo', address: { zip: '00001' } }, s2: { name: 'Tiger Kwoon' } };
const results: ResultRow[] = [
  { entryId: 'e1', competitorId: 'c1', competitorName: 'Ann', schoolId: 's1', event: 'forms', placement: 1 },
  { entryId: 'e2', competitorId: 'c2', competitorName: 'Bo', schoolId: 's1', event: 'forms', placement: 4 },
  { entryId: 'e3', competitorId: 'c3', competitorName: 'Cy', schoolId: 's2', event: 'weapons', placement: 2 },
];

{
  const list = buildShipList(results, schools);
  ok(list.shipments.length === 2, 'one shipment per school');
  const s1 = list.shipments.find((s) => s.schoolId === 's1')!;
  ok(s1.schoolName === 'Dragon Dojo', 'school name resolved');
  const ann = s1.items.find((i) => i.competitorId === 'c1')!;
  ok(ann.medals.includes('participation') && ann.medals.includes('gold'), '1st place gets participation + gold');
  const bo = s1.items.find((i) => i.competitorId === 'c2')!;
  ok(bo.medals.length === 1 && bo.medals[0] === 'participation', '4th place gets participation only');
  const cy = buildShipList(results, schools).shipments.find((s) => s.schoolId === 's2')!.items[0];
  ok(cy.medals.includes('silver'), '2nd place gets silver');
  // everyone gets a participation medal
  ok(results.every((r) => buildShipList([r], schools).shipments[0].items[0].medals.includes('participation')),
     'every competitor gets a participation medal');
}

// clearer medal-count check
{
  const list = buildShipList(results, schools);
  // Ann: participation+gold (2); Bo: participation (1); Cy: participation+silver (2) => 5
  ok(list.totalMedals === 5, `total medal pieces = 5 (got ${list.totalMedals})`);
}

// deterministic ordering
{
  const a = JSON.stringify(buildShipList(results, schools));
  const b = JSON.stringify(buildShipList([...results].reverse(), schools));
  ok(a === b, 'ship list is deterministic regardless of input order');
}

// ================= round-state machine =================
ok(nextState('open') === 'collecting', 'open -> collecting');
ok(nextState('resolving') === 'distributed', 'resolving -> distributed');
ok(nextState('finalized') === null, 'finalized is terminal');

const okCtx: GuardContext = { validEntryCount: 10, podsBelowFloorAcknowledged: true, allPodsResolved: true };

ok(guardBlock('closed', 'classified', okCtx) === null, 'closed -> classified allowed with entries');
ok(guardBlock('closed', 'classified', { ...okCtx, validEntryCount: 0 }) !== null, 'blocked: classify with zero entries');
ok(guardBlock('podded', 'judging', { ...okCtx, podsBelowFloorAcknowledged: false }) !== null, 'blocked: judging with unacknowledged under-floor pods');
ok(guardBlock('resolving', 'distributed', { ...okCtx, allPodsResolved: false }) !== null, 'blocked: distribute with unresolved pods');
ok(guardBlock('open', 'podded', okCtx) !== null, 'blocked: cannot skip states');
ok(guardBlock('podded', 'classified', okCtx) !== null, 'blocked: not a forward transition');

// rollback clears downstream
{
  const cleared = statesToClear('judging', 'classified');
  ok(JSON.stringify(cleared) === JSON.stringify(['collapsed', 'podded', 'judging']), 'rollback judging->classified clears collapsed,podded,judging');
  ok(statesToClear('classified', 'judging').length === 0, 'no clear when target is not earlier');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { for (const f of fails) console.log('  ✗ ' + f); process.exit(1); }
else console.log('All distribute + state-machine tests passed.');
