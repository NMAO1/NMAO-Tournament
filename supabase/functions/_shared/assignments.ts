// =====================================================================
// NMAO Tournament Engine — judge assignment
// Pure, DB-free, deterministic. Assigns judges to each entry's video:
//   - 1 judge for beginner/intermediate pods, 3 for advanced (pod.judgeCount)
//   - never a judge from the competitor's own school (conflict of interest)
//   - load-balanced across the eligible judge pool
// Deterministic tie-break (lowest current load, then judge id) so a given
// input always produces the same assignment — important for reproducibility.
// =====================================================================

export type JudgeInput = { id: string; schoolId: string };
export type AssignEntry = { entryId: string; competitorId: string; schoolId: string };
export type AssignPod = { podId: string; judgeCount: number; entries: AssignEntry[] };

export type Assignment = { entryId: string; judgeIds: string[]; shortfall: number };
export type AssignResult = { assignments: Assignment[]; flags: string[] };

/**
 * Assign judges to every entry across the given pods.
 * @param pods   pods with their entries and required judgeCount (1 or 3)
 * @param judges the eligible judge pool (id + schoolId)
 */
export function assignJudges(pods: AssignPod[], judges: JudgeInput[]): AssignResult {
  const load: Record<string, number> = {};
  for (const j of judges) load[j.id] = 0;

  const assignments: Assignment[] = [];
  const flags: string[] = [];

  for (const pod of pods) {
    for (const entry of pod.entries) {
      // eligible = not from the competitor's school
      const eligible = judges.filter((j) => j.schoolId !== entry.schoolId);
      eligible.sort((a, b) => load[a.id] - load[b.id] || a.id.localeCompare(b.id));

      const picked = eligible.slice(0, pod.judgeCount);
      for (const j of picked) load[j.id] += 1;

      const shortfall = pod.judgeCount - picked.length;
      if (shortfall > 0) {
        flags.push(
          `Entry ${entry.entryId} needs ${pod.judgeCount} judge(s) but only ${picked.length} eligible (own-school conflicts leave too few).`,
        );
      }
      assignments.push({ entryId: entry.entryId, judgeIds: picked.map((j) => j.id), shortfall });
    }
  }
  return { assignments, flags };
}
