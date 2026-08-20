// =====================================================================
// NMAO Tournament Engine — judge assignment
// Pure, DB-free, deterministic. Assigns judges PER POD (not per entry): the
// same judge (or 3-judge panel) scores EVERY entry in a pod, so placements
// within a pod compare like-for-like. Rules:
//   - 1 judge for beginner/intermediate pods, 3 for advanced (pod.judgeCount)
//   - a judge from ANY competitor's school in the pod is excluded (conflict of
//     interest) — the panel must be clean for the whole pod
//   - load-balanced across pods (a judge who takes a pod counts as +1 load)
// Deterministic tie-break (lowest current load, then judge id) so a given
// input always produces the same assignment — important for reproducibility.
// This matches the pull/claim path (claim-pod assigns a judge to a whole pod).
// =====================================================================

export type JudgeInput = { id: string; schoolId: string };
export type AssignEntry = { entryId: string; competitorId: string; schoolId: string };
export type AssignPod = { podId: string; judgeCount: number; entries: AssignEntry[] };

export type Assignment = { entryId: string; judgeIds: string[]; shortfall: number };
export type AssignResult = { assignments: Assignment[]; flags: string[] };

/**
 * Assign a judge/panel to every pod, then apply that panel to all its entries.
 * @param pods   pods with their entries and required judgeCount (1 or 3)
 * @param judges the eligible judge pool (id + schoolId)
 */
export function assignJudges(pods: AssignPod[], judges: JudgeInput[]): AssignResult {
  const load: Record<string, number> = {};
  for (const j of judges) load[j.id] = 0;

  const assignments: Assignment[] = [];
  const flags: string[] = [];

  for (const pod of pods) {
    if (pod.entries.length === 0) continue; // no entries -> no judges to spend

    // Pod-level conflict: exclude any judge from ANY competitor's school in the
    // pod (a pod is judged as a unit, so the panel must be clean for everyone).
    const podSchools = new Set(pod.entries.map((e) => e.schoolId));
    const eligible = judges.filter((j) => !podSchools.has(j.schoolId));
    eligible.sort((a, b) => load[a.id] - load[b.id] || a.id.localeCompare(b.id));

    const picked = eligible.slice(0, pod.judgeCount);
    for (const j of picked) load[j.id] += 1; // one increment per pod judged

    const shortfall = pod.judgeCount - picked.length;
    if (shortfall > 0) {
      flags.push(
        `Pod ${pod.podId} needs ${pod.judgeCount} judge(s) but only ${picked.length} eligible (own-school conflicts leave too few).`,
      );
    }

    // The SAME panel scores every entry in the pod.
    const judgeIds = picked.map((j) => j.id);
    for (const entry of pod.entries) {
      assignments.push({ entryId: entry.entryId, judgeIds, shortfall });
    }
  }
  return { assignments, flags };
}
