// =====================================================================
// NMAO Tournament Engine — Supabase-backed EngineStore (Deno / Edge)
// Implements the async EngineStore seam from engine.ts against the engine
// schema (rounds/pods/entries/judge_assignments/results) plus 001's
// skill_ratings / rating_history for persistent carry-over ratings.
//
// Uses the LOCKED rating model (docs/scoring-and-rating.md): rating is a
// 0-100 number seeded at 50, moved on placement vs same-rank podmates.
//
// Runs on Supabase Edge Functions (Deno), as the service role (bypasses
// RLS by design). NOT exercised by `npm test`, which covers the pure cores
// and the in-memory orchestration.
//
// Schema follow-ups this adapter assumes (tracked in docs/project-log.md):
//   - judges need a school link (`judges.school_id`) so own-school conflicts
//     can be excluded; until then conflict exclusion is a no-op.
//   - a `medal_shipments` table (or reuse of `medals`) to persist the ship list.
//   - skill_ratings.rating defaults to the seed (50) for a new competitor;
//     skill_ratings.events_count drives the provisional K.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { EngineStore, StepName, StepStatus, PodForResolve, ResultWrite, RatingWrite } from './engine.ts';
import { DEFAULT_RATING_CONFIG, weightedJudgeScore } from './rating.ts';
import type { AssignPod, JudgeInput, Assignment } from './assignments.ts';
import type { ResultRow } from './distribute.ts';

// Season-1 events encode style in their key: `open_*` = Open profile, else Traditional.
export function styleFromEvent(event: string): 'traditional' | 'open' {
  return event.startsWith('open') ? 'open' : 'traditional';
}

// A judge submits one score per criterion (0-100). We persist the per-criterion
// rows (audit) and compute the video's single weighted score via the style's
// rubric profile, storing it on judge_assignments.score so the resolve/rating
// pipeline is unchanged. Called from the judge app's submit action.
export async function submitJudgeScores(
  db: SupabaseClient,
  args: { entryId: string; judgeId: string; event: string; scores: { criterionCode: string; rawScore: number }[] },
): Promise<number> {
  const style = styleFromEvent(args.event);
  const { data: weightRows } = await db
    .from('rubric_weights')
    .select('criterion_code, weight_pct')
    .eq('style', style);
  const weights = (weightRows ?? []).map((w: any) => ({ criterionCode: w.criterion_code, weightPct: Number(w.weight_pct) }));

  await db.from('submission_scores').upsert(
    args.scores.map((s) => ({
      entry_id: args.entryId,
      judge_id: args.judgeId,
      criterion_code: s.criterionCode,
      raw_score: s.rawScore,
    })),
    { onConflict: 'entry_id,judge_id,criterion_code' },
  );

  const score = weightedJudgeScore(args.scores, weights);
  await db
    .from('judge_assignments')
    .update({ score, state: 'submitted', submitted_at: new Date().toISOString() })
    .eq('entry_id', args.entryId)
    .eq('judge_id', args.judgeId);
  return score;
}

export function createSupabaseStore(client?: SupabaseClient): EngineStore {
  const db =
    client ??
    createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

  return {
    // ---------- idempotency ledger ----------
    async getStepStatus(roundId, step) {
      const { data } = await db
        .from('round_step_runs')
        .select('status')
        .eq('round_id', roundId)
        .eq('step', step)
        .maybeSingle();
      return (data?.status ?? null) as StepStatus | null;
    },
    async setStepStatus(roundId, step, status, detail) {
      const patch: any = { round_id: roundId, step, status, detail: detail ?? null };
      if (status === 'running') patch.started_at = new Date().toISOString();
      if (status === 'done' || status === 'error') patch.completed_at = new Date().toISOString();
      await db.from('round_step_runs').upsert(patch, { onConflict: 'round_id,step' });
    },

    // ---------- assign_judges ----------
    async getPodsForAssignment(roundId) {
      const { data: pods } = await db
        .from('pods')
        .select('id, judge_count, divisions!inner(round_id)')
        .eq('divisions.round_id', roundId);
      const out: AssignPod[] = [];
      for (const p of pods ?? []) {
        const { data: entries } = await db
          .from('entries')
          .select('id, competitor_id, competitors(school_id)')
          .eq('pod_id', (p as any).id)
          .eq('status', 'valid');
        out.push({
          podId: (p as any).id,
          judgeCount: (p as any).judge_count ?? 1,
          entries: (entries ?? []).map((e: any) => ({
            entryId: e.id,
            competitorId: e.competitor_id,
            schoolId: e.competitors?.school_id ?? '',
          })),
        });
      }
      return out;
    },
    async getJudgePool(_roundId) {
      const { data } = await db
        .from('judges')
        .select('id, school_id')
        .eq('status', 'active')
        .eq('background_check_status', 'cleared');
      return (data ?? []).map((j: any): JudgeInput => ({ id: j.id, schoolId: j.school_id ?? '' }));
    },
    async saveAssignments(_roundId, assignments: Assignment[]) {
      const rows: any[] = [];
      const entryIds = assignments.map((a) => a.entryId);
      const { data: entryRows } = await db.from('entries').select('id, pod_id').in('id', entryIds);
      const podByEntry = new Map((entryRows ?? []).map((r: any) => [r.id, r.pod_id]));
      for (const a of assignments) {
        const role = a.judgeIds.length > 1 ? 'panel' : 'sole';
        for (const jid of a.judgeIds) {
          rows.push({ entry_id: a.entryId, judge_id: jid, pod_id: podByEntry.get(a.entryId), role, state: 'assigned' });
        }
      }
      if (rows.length) {
        // unique (entry_id, judge_id) makes this idempotent.
        await db.from('judge_assignments').upsert(rows, { onConflict: 'entry_id,judge_id', ignoreDuplicates: true });
      }
    },

    // ---------- resolve (+ ratings) ----------
    async getPodsForResolve(roundId) {
      const { data: pods } = await db
        .from('pods')
        .select('id, divisions!inner(round_id)')
        .eq('divisions.round_id', roundId);
      const result: PodForResolve[] = [];

      for (const pod of pods ?? []) {
        const { data: entries } = await db
          .from('entries')
          .select('id, competitor_id, event, created_at, declared_rank, competitors(first_name, last_name, school_id)')
          .eq('pod_id', (pod as any).id)
          .eq('status', 'valid');

        const podEntries = [];
        for (const e of entries ?? []) {
          const ee = e as any;
          const { data: assigns } = await db
            .from('judge_assignments')
            .select('score, submitted_at')
            .eq('entry_id', ee.id)
            .not('score', 'is', null);
          const judgeScores = (assigns ?? []).map((a: any) => Number(a.score));
          if (judgeScores.length === 0) continue; // incomplete pod: handled by reopen flow, not here

          const { data: sr } = await db
            .from('skill_ratings')
            .select('rating, events_count')
            .eq('competitor_id', ee.competitor_id)
            .maybeSingle();

          const submittedAt = (assigns ?? [])
            .map((a: any) => (a.submitted_at ? Date.parse(a.submitted_at) : Date.parse(ee.created_at)))
            .reduce((m: number, t: number) => Math.min(m, t), Number.MAX_SAFE_INTEGER);

          podEntries.push({
            entryId: ee.id,
            competitorId: ee.competitor_id,
            rank: ee.declared_rank,
            judgeScores,
            submittedAt,
            schoolId: ee.competitors?.school_id ?? '',
            competitorName: `${ee.competitors?.first_name ?? ''} ${ee.competitors?.last_name ?? ''}`.trim(),
            event: ee.event,
            rating: sr?.rating != null ? Number(sr.rating) : DEFAULT_RATING_CONFIG.seed,
            roundsPlayed: sr?.events_count ?? 0,
          });
        }
        if (podEntries.length > 0) result.push({ podId: (pod as any).id, entries: podEntries });
      }
      return result;
    },
    async saveResults(_roundId, rows: ResultWrite[]) {
      if (rows.length === 0) return;
      const payload = rows.map((r) => ({
        entry_id: r.entryId,
        pod_id: r.podId,
        score: r.score,
        placement: r.placement,
        rating_delta: r.ratingDelta,
        rating_after: r.ratingAfter,
      }));
      await db.from('results').upsert(payload, { onConflict: 'entry_id' });
    },
    async saveRatingUpdates(_roundId, rows: RatingWrite[]) {
      if (rows.length === 0) return;
      const prov = DEFAULT_RATING_CONFIG.provisionalRounds;
      for (const r of rows) {
        const { data: sr } = await db
          .from('skill_ratings')
          .select('events_count')
          .eq('competitor_id', r.competitorId)
          .maybeSingle();
        const events = (sr?.events_count ?? 0) + 1;
        await db.from('skill_ratings').upsert(
          {
            competitor_id: r.competitorId,
            rating: r.ratingAfter,
            events_count: events,
            provisional: events < prov,
            last_event_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'competitor_id' },
        );
        await db.from('rating_history').insert({
          competitor_id: r.competitorId,
          rating_before: r.ratingBefore,
          rating_after: r.ratingAfter,
          k_factor: r.k, // K is 8/4 on the 0-100 scale; ensure the column is numeric(5,3)+
        });
      }
    },

    // ---------- distribute ----------
    async getResultsForShipping(roundId) {
      const { data } = await db
        .from('results')
        .select('entry_id, placement, entries!inner(round_id, event, competitor_id, competitors(first_name, last_name, school_id))')
        .eq('entries.round_id', roundId);
      return (data ?? []).map((r: any): ResultRow => ({
        entryId: r.entry_id,
        competitorId: r.entries?.competitor_id,
        competitorName: `${r.entries?.competitors?.first_name ?? ''} ${r.entries?.competitors?.last_name ?? ''}`.trim(),
        schoolId: r.entries?.competitors?.school_id ?? '',
        event: r.entries?.event,
        placement: r.placement,
      }));
    },
    async getSchools(_roundId) {
      const { data } = await db.from('schools').select('id, name, address');
      const out: Record<string, { name: string; address?: unknown }> = {};
      for (const s of data ?? []) out[(s as any).id] = { name: (s as any).name, address: (s as any).address };
      return out;
    },
    async saveShipList(roundId, list) {
      await db.from('round_step_runs').upsert(
        { round_id: roundId, step: 'distribute', status: 'done', detail: list as any, completed_at: new Date().toISOString() },
        { onConflict: 'round_id,step' },
      );
    },
  };
}
