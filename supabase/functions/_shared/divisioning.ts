// =====================================================================
// NMAO Tournament Engine — divisioning core
// Pure, DB-free functions: classify -> collapse -> formPods.
// runDivisioning() chains them and IS the simulate core (spec §7).
// Everything is deterministic and side-effect-free so it can be unit
// tested and reused verbatim by both the live engine and the preview.
// =====================================================================

export type AgeBracket = { key: string; min: number; max: number };

export type Scheme = {
  axes: Array<
    | { key: 'age'; type: 'bracket'; active: boolean; brackets: AgeBracket[]; mergeable: boolean }
    | { key: 'rank'; type: 'tier'; active: boolean; tiers: string[]; mergeable: boolean }
    | { key: 'event'; type: 'category'; active: boolean; values: string[]; mergeable: boolean }
  >;
  podCap: number;            // 20
  podSplitThreshold: number; // 22
  podFloor: number;          // 6
  collapseOrder: string[];   // e.g. ['rank','age'] — which axis to merge first
};

export type Entry = {
  id: string;
  event: string;
  ageBracket: string; // key matching scheme age brackets
  rank: string;       // key matching scheme rank tiers
  rating: number;
};

export type Division = {
  key: string;              // stable key
  event: string;
  ageKey: string;           // single or composite (e.g. "7-9+10-12")
  rankKey: string;          // single or composite (e.g. "beginner+intermediate")
  isCollapsed: boolean;
  collapsedFrom: string[];  // base division keys merged in
  cells: string[];          // "ageIndex,rankIndex" base cells covered
  entries: Entry[];
  underFloorUnmergeable?: boolean; // flagged for operator (spec §6.2 step 4)
};

export type Pod = {
  divisionKey: string;
  seq: number;
  judgeCount: number; // 1 (beg/int) or 3 (advanced)
  entries: Entry[];
};

export type DivisioningResult = {
  divisions: Division[];
  pods: Pod[];
  flags: string[]; // human-readable notes for the operator board
};

// ---------- helpers ----------

function ageAxis(scheme: Scheme) {
  const a = scheme.axes.find((x) => x.key === 'age');
  return a && a.type === 'bracket' ? a.brackets.map((b) => b.key) : [];
}
function rankAxis(scheme: Scheme) {
  const r = scheme.axes.find((x) => x.key === 'rank');
  return r && r.type === 'tier' ? r.tiers : [];
}
function axisMergeable(scheme: Scheme, key: string) {
  return !!scheme.axes.find((x) => x.key === key)?.mergeable;
}

// ---------- 6.1 classify ----------

export function classify(entries: Entry[], scheme: Scheme): Division[] {
  const ages = ageAxis(scheme);
  const ranks = rankAxis(scheme);
  const map = new Map<string, Division>();
  for (const e of entries) {
    const ai = ages.indexOf(e.ageBracket);
    const ri = ranks.indexOf(e.rank);
    const key = `${e.event}|${e.ageBracket}|${e.rank}`;
    let d = map.get(key);
    if (!d) {
      d = {
        key,
        event: e.event,
        ageKey: e.ageBracket,
        rankKey: e.rank,
        isCollapsed: false,
        collapsedFrom: [key],
        cells: [`${ai},${ri}`],
        entries: [],
      };
      map.set(key, d);
    }
    d.entries.push(e);
  }
  return [...map.values()];
}

// ---------- 6.2 collapse ----------

type WorkDiv = {
  event: string;
  cells: Set<string>; // "ai,ri"
  entries: Entry[];
  collapsedFrom: Set<string>;
  unmergeable: boolean;
};

function cellCoords(c: string): [number, number] {
  const [a, r] = c.split(',').map(Number);
  return [a, r];
}

function adjacent(d1: WorkDiv, d2: WorkDiv, axis: string): boolean {
  if (d1.event !== d2.event) return false;
  for (const c1 of d1.cells) {
    const [a1, r1] = cellCoords(c1);
    for (const c2 of d2.cells) {
      const [a2, r2] = cellCoords(c2);
      if (axis === 'rank' && a1 === a2 && Math.abs(r1 - r2) === 1) return true;
      if (axis === 'age' && r1 === r2 && Math.abs(a1 - a2) === 1) return true;
    }
  }
  return false;
}

function stableKey(d: WorkDiv): string {
  return d.event + '|' + [...d.cells].sort().join('&');
}

export function collapse(divisions: Division[], scheme: Scheme): Division[] {
  const floor = scheme.podFloor;
  let work: WorkDiv[] = divisions.map((d) => ({
    event: d.event,
    cells: new Set(d.cells),
    entries: [...d.entries],
    collapsedFrom: new Set(d.collapsedFrom),
    unmergeable: false,
  }));

  // greedy: repeatedly take the smallest under-floor division and merge it
  // with its nearest legal neighbor, preferring earlier axes in collapseOrder.
  // Each merge reduces the division count by 1, so this always terminates.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const under = work
      .filter((d) => d.entries.length < floor && !d.unmergeable)
      .sort((a, b) => a.entries.length - b.entries.length || stableKey(a).localeCompare(stableKey(b)));
    if (under.length === 0) break;
    const D = under[0];

    let candidate: WorkDiv | null = null;
    for (const axis of scheme.collapseOrder) {
      if (!axisMergeable(scheme, axis)) continue;
      const cands = work
        .filter((o) => o !== D && adjacent(D, o, axis))
        .sort((a, b) => a.entries.length - b.entries.length || stableKey(a).localeCompare(stableKey(b)));
      if (cands.length) {
        candidate = cands[0];
        break;
      }
    }

    if (!candidate) {
      D.unmergeable = true; // no legal neighbor on any mergeable axis
      continue;
    }

    // merge D into candidate
    for (const c of D.cells) candidate.cells.add(c);
    for (const b of D.collapsedFrom) candidate.collapsedFrom.add(b);
    candidate.entries.push(...D.entries);
    work = work.filter((d) => d !== D);
  }

  const ages = ageAxis(scheme);
  const ranks = rankAxis(scheme);
  return work.map((d) => {
    const cells = [...d.cells];
    const ageKeys = [...new Set(cells.map((c) => ages[cellCoords(c)[0]]).filter(Boolean))];
    const rankKeys = [...new Set(cells.map((c) => ranks[cellCoords(c)[1]]).filter(Boolean))];
    const collapsedFrom = [...d.collapsedFrom].sort();
    return {
      key: stableKey(d),
      event: d.event,
      ageKey: ageKeys.join('+'),
      rankKey: rankKeys.join('+'),
      isCollapsed: collapsedFrom.length > 1,
      collapsedFrom,
      cells,
      entries: d.entries,
      underFloorUnmergeable: d.unmergeable && d.entries.length < floor ? true : undefined,
    };
  });
}

// ---------- 6.3 form pods ----------

function splitSizes(n: number, numPods: number): number[] {
  const base = Math.floor(n / numPods);
  const rem = n % numPods;
  return Array.from({ length: numPods }, (_, i) => base + (i < rem ? 1 : 0));
}

export function formPods(division: Division, scheme: Scheme): Pod[] {
  const sorted = [...division.entries].sort((a, b) => b.rating - a.rating);
  const n = sorted.length;
  const numPods = n < scheme.podSplitThreshold ? 1 : Math.ceil(n / scheme.podCap);
  const sizes = splitSizes(n, numPods);
  // 3 judges if the (possibly collapsed) division includes the advanced tier.
  const judgeCount = division.rankKey.split('+').includes('advanced') ? 3 : 1;

  const pods: Pod[] = [];
  let idx = 0;
  for (let seq = 0; seq < numPods; seq++) {
    pods.push({
      divisionKey: division.key,
      seq: seq + 1,
      judgeCount,
      entries: sorted.slice(idx, idx + sizes[seq]),
    });
    idx += sizes[seq];
  }
  return pods;
}

// ---------- runDivisioning = the simulate core ----------

export function runDivisioning(entries: Entry[], scheme: Scheme): DivisioningResult {
  const base = classify(entries, scheme);
  const divisions = collapse(base, scheme);
  const pods = divisions.flatMap((d) => formPods(d, scheme));
  const flags: string[] = [];
  for (const d of divisions) {
    if (d.underFloorUnmergeable) {
      flags.push(`Division ${d.event}/${d.ageKey}/${d.rankKey} has ${d.entries.length} entries and cannot collapse further (no legal neighbor).`);
    }
  }
  return { divisions, pods, flags };
}
