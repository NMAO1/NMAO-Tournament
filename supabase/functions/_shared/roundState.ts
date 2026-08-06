// =====================================================================
// NMAO Tournament Engine — round-state machine (spec §4)
// Pure helpers the round-state controller uses to sequence steps and
// enforce guardrails. DB-free and deterministic.
// =====================================================================

export const ROUND_STATES = [
  'open', 'collecting', 'closed', 'classified', 'collapsed',
  'podded', 'judging', 'resolving', 'distributed', 'finalized',
] as const;

export type RoundState = (typeof ROUND_STATES)[number];

// The engine step that produces each state (null = operator/schedule driven).
export const STATE_STEP: Partial<Record<RoundState, string>> = {
  classified: 'classify',
  collapsed: 'collapse',
  podded: 'form_pods',
  judging: 'assign_judges',
  resolving: 'resolve',       // resolve + update_ratings run in this transition
  distributed: 'distribute',
};

export function nextState(s: RoundState): RoundState | null {
  const i = ROUND_STATES.indexOf(s);
  return i >= 0 && i < ROUND_STATES.length - 1 ? ROUND_STATES[i + 1] : null;
}

export function isForward(from: RoundState, to: RoundState): boolean {
  return ROUND_STATES.indexOf(to) > ROUND_STATES.indexOf(from);
}

// Context the guardrails inspect (supplied by the controller from the DB).
export type GuardContext = {
  validEntryCount: number;
  podsBelowFloorAcknowledged: boolean; // operator has acknowledged any under-floor pods
  allPodsResolved: boolean;
};

// Spec §4 guardrails. Returns null if the transition is allowed, else the reason.
export function guardBlock(
  from: RoundState,
  to: RoundState,
  ctx: GuardContext,
): string | null {
  if (!isForward(from, to)) return `Not a forward transition: ${from} -> ${to}.`;
  if (nextState(from) !== to) return `Must advance one state at a time: ${from} -> ${to}.`;

  // cannot advance past `closed` with zero valid entries
  if (from === 'closed' && ctx.validEntryCount === 0) {
    return 'Cannot classify a round with zero valid entries.';
  }
  // cannot enter `judging` with under-floor pods not acknowledged by an operator
  if (to === 'judging' && !ctx.podsBelowFloorAcknowledged) {
    return 'Cannot enter judging while under-floor pods are unacknowledged.';
  }
  // cannot `distribute` with any pod not resolved
  if (to === 'distributed' && !ctx.allPodsResolved) {
    return 'Cannot distribute while some pods are unresolved.';
  }
  return null;
}

// Rolling back clears downstream artifacts; returns the states whose step
// output must be discarded when moving from `from` back to `to`.
export function statesToClear(from: RoundState, to: RoundState): RoundState[] {
  const fi = ROUND_STATES.indexOf(from);
  const ti = ROUND_STATES.indexOf(to);
  if (ti >= fi) return [];
  return ROUND_STATES.slice(ti + 1, fi + 1);
}
