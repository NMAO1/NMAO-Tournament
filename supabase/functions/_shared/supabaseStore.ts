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
import { EngineStore, DivisionStore, StepName, StepStatus, PodForResolve, ResultWrite, RatingWrite } from './engine.ts';
import { DEFAULT_RATING_CONFIG, weightedJudgeScore } from './rating.ts';
import type { AssignPod, JudgeInput, Assignment } from './assignments.ts';
import type { ResultRow } from './distribute.ts';
import type { Scheme, Entry } from './divisioning.ts';

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

// =====================================================================
// Operator actions (not pipeline steps): finalize + rollback.
// These are DB-heavy operations invoked from Mission Control, so they live
// here as standalone functions taking a service-role client (like
// submitJudgeScores) rather than on the EngineStore seam. Return a
// StepOutcome-shaped object so round-controller reports them uniformly.
// =====================================================================

const PIPELINE_STEPS: StepName[] = ['divide', 'assign_judges', 'resolve', 'distribute'];

// CLOSE: open/collecting -> closed. Validates the entry pool (submitted entries
// WITH a video become 'valid'; those without are 'voided'), then closes the entry
// window so divide can run. Idempotent: re-press once closed just re-checks.
export async function closeRound(
  db: SupabaseClient,
  roundId: string,
  actorId?: string | null,
): Promise<{ step: string; ran: boolean; flags: string[]; detail: unknown }> {
  const { data: round, error } = await db.from('rounds').select('state').eq('id', roundId).single();
  if (error || !round) throw new Error('Round not found.');
  const state = (round as any).state;
  const OPENISH = ['open', 'collecting'];

  const { data: subs } = await db
    .from('entries').select('id, video_url').eq('round_id', roundId).eq('status', 'submitted');
  const valid = (subs ?? []).filter((e: any) => e.video_url).map((e: any) => e.id);
  const voided = (subs ?? []).filter((e: any) => !e.video_url).map((e: any) => e.id);
  const now = new Date().toISOString();
  if (valid.length) await db.from('entries').update({ status: 'valid', updated_at: now }).in('id', valid);
  if (voided.length) await db.from('entries').update({ status: 'voided', updated_at: now }).in('id', voided);

  if (!OPENISH.includes(state)) {
    return { step: 'close', ran: false, flags: [], detail: { state, validated: valid.length, voided: voided.length, note: 'already closed' } };
  }
  await db.from('rounds').update({ state: 'closed', updated_at: now }).eq('id', roundId);
  await db.from('engine_audit').insert({
    round_id: roundId, actor_id: actorId ?? null, action: 'close',
    before: { state }, after: { state: 'closed' },
  });
  return { step: 'close', ran: true, flags: [], detail: { state: 'closed', from: state, validated: valid.length, voided: voided.length } };
}

// FINALIZE: distributed -> finalized. Freezes the scheme version (locked) and
// stamps the round locked_at. Idempotent: a re-press on a finalized round no-ops.
export async function finalizeRound(
  db: SupabaseClient,
  roundId: string,
  actorId?: string | null,
): Promise<{ step: string; ran: boolean; flags: string[]; detail: unknown }> {
  const { data: round, error } = await db
    .from('rounds').select('state, scheme_id').eq('id', roundId).single();
  if (error || !round) throw new Error('Round not found.');
  const state = (round as any).state;
  if (state === 'finalized') return { step: 'finalize', ran: false, flags: [], detail: 'already done' };
  if (state !== 'distributed') {
    throw new Error(`Cannot finalize: round is '${state}' (must be 'distributed').`);
  }

  // Freeze the scheme version — immutable once locked (spec §4).
  await db.from('division_schemes').update({ locked: true }).eq('id', (round as any).scheme_id);
  const now = new Date().toISOString();
  await db.from('rounds').update({ state: 'finalized', locked_at: now, updated_at: now }).eq('id', roundId);
  await db.from('engine_audit').insert({
    round_id: roundId, actor_id: actorId ?? null, action: 'finalize',
    before: { state: 'distributed' }, after: { state: 'finalized' },
  });
  return { step: 'finalize', ran: true, flags: [], detail: { state: 'finalized' } };
}

// REOPEN: finalized -> distributed. Reverses finalize so an operator who locked a
// round early can correct it (re-distribute, or roll back). Unlocks the scheme and
// clears locked_at. Idempotent: a non-finalized round no-ops. Rollback still refuses
// a finalized round, so reopen is the deliberate, audited way back.
export async function reopenRound(
  db: SupabaseClient,
  roundId: string,
  actorId?: string | null,
): Promise<{ step: string; ran: boolean; flags: string[]; detail: unknown }> {
  const { data: round, error } = await db
    .from('rounds').select('state, scheme_id').eq('id', roundId).single();
  if (error || !round) throw new Error('Round not found.');
  const state = (round as any).state;
  if (state !== 'finalized') {
    return { step: 'reopen', ran: false, flags: [], detail: { state, note: 'not finalized' } };
  }
  await db.from('division_schemes').update({ locked: false }).eq('id', (round as any).scheme_id);
  const now = new Date().toISOString();
  await db.from('rounds').update({ state: 'distributed', locked_at: null, updated_at: now }).eq('id', roundId);
  await db.from('engine_audit').insert({
    round_id: roundId, actor_id: actorId ?? null, action: 'reopen',
    before: { state: 'finalized' }, after: { state: 'distributed' },
  });
  return { step: 'reopen', ran: true, flags: [], detail: { state: 'distributed' } };
}

// ROLLBACK: clear the output of `to` and every later step, then reset the round
// so `to` can be re-run. Reverts ratings using each rating_history row's
// rating_before (safe only for the latest rated round — guarded below).
export async function rollbackRound(
  db: SupabaseClient,
  roundId: string,
  to: StepName,
  actorId?: string | null,
): Promise<{ step: string; ran: boolean; flags: string[]; detail: unknown }> {
  if (!PIPELINE_STEPS.includes(to)) throw new Error(`Invalid rollback target: ${to}.`);
  const { data: round, error } = await db
    .from('rounds').select('state, season_id, seq').eq('id', roundId).single();
  if (error || !round) throw new Error('Round not found.');
  const state = (round as any).state;
  if (state === 'finalized') throw new Error('Round is finalized; cannot roll back.');

  const toIdx = PIPELINE_STEPS.indexOf(to);
  const clearAssignments = toIdx <= PIPELINE_STEPS.indexOf('assign_judges');
  const clearResults = toIdx <= PIPELINE_STEPS.indexOf('resolve');
  const clearDivide = to === 'divide';

  const { data: entRows } = await db.from('entries').select('id').eq('round_id', roundId);
  const entryIds = (entRows ?? []).map((e: any) => e.id);

  // --- ratings + results reversal (only when rolling back resolve or earlier) ---
  if (clearResults) {
    // Safety: refuse if a LATER round in the season already carries ratings built
    // on this one — rolling this back would corrupt their carry-over.
    const { data: laterRounds } = await db
      .from('rounds').select('id').eq('season_id', (round as any).season_id).gt('seq', (round as any).seq);
    const laterIds = (laterRounds ?? []).map((r: any) => r.id);
    if (laterIds.length) {
      const { count } = await db
        .from('rating_history').select('*', { count: 'exact', head: true }).in('round_id', laterIds);
      if ((count ?? 0) > 0) {
        throw new Error('Cannot roll back ratings: a later round already has ratings. Roll it back first.');
      }
    }
    // Capture this round's rating_before per competitor (= their pre-round rating),
    // then delete this round's results + history and restore.
    const { data: hist } = await db
      .from('rating_history').select('competitor_id, rating_before').eq('round_id', roundId);
    const beforeByComp = new Map<string, number>();
    for (const h of hist ?? []) beforeByComp.set((h as any).competitor_id, Number((h as any).rating_before));

    if (entryIds.length) await db.from('results').delete().in('entry_id', entryIds);
    await db.from('rating_history').delete().eq('round_id', roundId);

    const prov = DEFAULT_RATING_CONFIG.provisionalRounds;
    for (const [competitorId, ratingBefore] of beforeByComp) {
      const { count } = await db
        .from('rating_history').select('*', { count: 'exact', head: true }).eq('competitor_id', competitorId);
      const events = count ?? 0;
      await db.from('skill_ratings').update({
        rating: ratingBefore, events_count: events, provisional: events < prov,
        updated_at: new Date().toISOString(),
      }).eq('competitor_id', competitorId);
    }
  }

  // --- medals + shipments (distribute output — always cleared) ---
  await db.from('medals').delete().eq('round_id', roundId);
  await db.from('medal_shipments').delete().eq('round_id', roundId);

  // --- judge assignments ---
  if (clearAssignments && entryIds.length) {
    await db.from('judge_assignments').delete().in('entry_id', entryIds);
  }

  // --- divisions / pods / entry stamps (full divide rollback) ---
  // Unstamp entries BEFORE deleting pods (entries.pod_id references pods).
  if (clearDivide) {
    await db.from('entries').update({ division_id: null, pod_id: null }).eq('round_id', roundId);
    const { data: divRows } = await db.from('divisions').select('id').eq('round_id', roundId);
    const divIds = (divRows ?? []).map((d: any) => d.id);
    if (divIds.length) await db.from('pods').delete().in('division_id', divIds);
    await db.from('divisions').delete().eq('round_id', roundId);
  }

  // --- clear the step-run ledger for `to` and every later step (so they re-run) ---
  const stepsCleared = PIPELINE_STEPS.slice(toIdx);
  await db.from('round_step_runs').delete().eq('round_id', roundId).in('step', stepsCleared);

  // --- reset round state (only divide/distribute stamp state; pre-divide = closed,
  //     everything else rests at podded until distribute re-runs) ---
  const targetState = clearDivide ? 'closed' : 'podded';
  const now = new Date().toISOString();
  await db.from('rounds').update({ state: targetState, locked_at: null, updated_at: now }).eq('id', roundId);

  await db.from('engine_audit').insert({
    round_id: roundId, actor_id: actorId ?? null, action: 'rollback',
    before: { state }, after: { state: targetState, to },
  });
  return { step: 'rollback', ran: true, flags: [], detail: { to, state: targetState, cleared: stepsCleared } };
}

export function createSupabaseStore(client?: SupabaseClient): EngineStore & DivisionStore {
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
    async claimStep(roundId, step) {
      // Race-free claim via the claim_step() SQL (INSERT ... ON CONFLICT ... WHERE).
      const { data, error } = await db.rpc('claim_step', { p_round_id: roundId, p_step: step });
      if (error) throw error;
      return data === true;
    },

    // ---------- divide (classify -> collapse -> form pods, persisted) ----------
    async getSchemeForRound(roundId) {
      const { data: round, error: rErr } = await db
        .from('rounds')
        .select('scheme_id')
        .eq('id', roundId)
        .single();
      if (rErr) throw rErr;
      const { data: s, error: sErr } = await db
        .from('division_schemes')
        .select('axes, pod_cap, pod_split_threshold, pod_floor, collapse_order')
        .eq('id', (round as any).scheme_id)
        .single();
      if (sErr) throw sErr;
      return {
        axes: (s as any).axes,
        podCap: (s as any).pod_cap,
        podSplitThreshold: (s as any).pod_split_threshold,
        podFloor: (s as any).pod_floor,
        collapseOrder: (s as any).collapse_order,
      } as Scheme;
    },
    async getEntriesForDivision(roundId) {
      const { data } = await db
        .from('entries')
        .select('id, event, age_bracket, declared_rank, rating_at_entry')
        .eq('round_id', roundId)
        .eq('status', 'valid');
      return (data ?? []).map((e: any): Entry => ({
        id: e.id,
        event: e.event,
        ageBracket: e.age_bracket,
        rank: e.declared_rank,
        rating: e.rating_at_entry != null ? Number(e.rating_at_entry) : DEFAULT_RATING_CONFIG.seed,
      }));
    },
    async saveDivisioning(roundId, result) {
      // 1) upsert divisions (unique on round_id,event,age_key,rank_key), map key -> id
      const divRows = result.divisions.map((d) => ({
        round_id: roundId,
        event: d.event,
        age_key: d.ageKey,
        rank_key: d.rankKey,
        is_collapsed: d.isCollapsed,
        collapsed_from: d.collapsedFrom,
        entry_count: d.entries.length,
      }));
      const { data: divBack, error: divErr } = await db
        .from('divisions')
        .upsert(divRows, { onConflict: 'round_id,event,age_key,rank_key' })
        .select('id, event, age_key, rank_key');
      if (divErr) throw divErr;
      const divIdByTriple = new Map<string, string>(
        (divBack ?? []).map((r: any) => [`${r.event}|${r.age_key}|${r.rank_key}`, r.id] as [string, string]),
      );
      const divIdByKey = new Map<string, string>();
      for (const d of result.divisions) {
        const id = divIdByTriple.get(`${d.event}|${d.ageKey}|${d.rankKey}`);
        if (id) divIdByKey.set(d.key, id);
      }

      // 2) upsert pods (unique on division_id,seq), map (divisionId:seq) -> id
      const podRows = result.pods.map((p) => ({
        division_id: divIdByKey.get(p.divisionKey),
        seq: p.seq,
        size: p.entries.length,
        judge_count: p.judgeCount,
        state: 'forming',
      }));
      const { data: podBack, error: podErr } = await db
        .from('pods')
        .upsert(podRows, { onConflict: 'division_id,seq' })
        .select('id, division_id, seq');
      if (podErr) throw podErr;
      const podIdByDivSeq = new Map<string, string>(
        (podBack ?? []).map((r: any) => [`${r.division_id}:${r.seq}`, r.id] as [string, string]),
      );

      // 3) stamp each entry with its division_id + pod_id
      let assigned = 0;
      for (const p of result.pods) {
        const divisionId = divIdByKey.get(p.divisionKey);
        const podId = podIdByDivSeq.get(`${divisionId}:${p.seq}`);
        for (const e of p.entries) {
          await db.from('entries').update({ division_id: divisionId, pod_id: podId }).eq('id', e.id);
          assigned++;
        }
      }

      // 4) advance round state (classify -> collapse -> form_pods complete)
      await db.from('rounds').update({ state: 'podded' }).eq('id', roundId);

      return { divisions: result.divisions.length, pods: result.pods.length, assigned };
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
      // Advance pod.state so resolved pods leave the claimable pool (available-pods
      // / fill-unclaimed filter on state != 'resolved') and give a real per-pod signal.
      const podIds = [...new Set(rows.map((r) => r.podId).filter(Boolean))];
      if (podIds.length) await db.from('pods').update({ state: 'resolved' }).in('id', podIds);
    },
    async saveRatingUpdates(roundId, rows: RatingWrite[]) {
      if (rows.length === 0) return;
      const prov = DEFAULT_RATING_CONFIG.provisionalRounds;

      // 1) One history row per rated entry — UPSERT on entry_id so a re-run
      //    overwrites in place instead of appending duplicates.
      await db.from('rating_history').upsert(
        rows.map((r) => ({
          competitor_id: r.competitorId,
          round_id: roundId,
          entry_id: r.entryId,
          rating_before: r.ratingBefore,
          rating_after: r.ratingAfter,
          rating_delta: r.ratingDelta,
          opponents: r.opponents,
          k_factor: r.k, // K is 8/4 on the 0-100 scale; column is numeric(5,2)
        })),
        { onConflict: 'entry_id' },
      );

      // 2) Current rating + events_count DERIVED from history (a count), not
      //    read-add-write — so re-running the same round can't inflate the
      //    count. events_count = rated entries on record for the competitor.
      for (const r of rows) {
        const { count } = await db
          .from('rating_history')
          .select('*', { count: 'exact', head: true })
          .eq('competitor_id', r.competitorId);
        const events = count ?? 1;
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
      // Materialize one shipment row per school (idempotent on round_id,school_id).
      for (const sh of list.shipments) {
        await db.from('medal_shipments').upsert(
          {
            round_id: roundId,
            school_id: sh.schoolId,
            item_count: sh.itemCount,
            manifest: sh as any,
            ship_status: 'pending',
            ship_address: (sh.address ?? null) as any,
          },
          { onConflict: 'round_id,school_id' },
        );
      }
      // medals has no natural unique key; replace this round's set so a re-run
      // can't duplicate (distribute is claim-guarded, so this is belt-and-braces).
      await db.from('medals').delete().eq('round_id', roundId);
      const medalRows: any[] = [];
      for (const sh of list.shipments) {
        for (const it of sh.items) {
          for (const m of it.medals) {
            medalRows.push({
              round_id: roundId,
              competitor_id: it.competitorId,
              event: it.event,
              medal_type: m,
              placement: it.placement >= 1 && it.placement <= 3 ? it.placement : null,
            });
          }
        }
      }
      if (medalRows.length) await db.from('medals').insert(medalRows);
      // Assign a motivational saying to each non-placer for the reveal (idempotent:
      // only fills results.saying_id where null; non-repeating per competitor).
      await db.rpc('assign_reveal_sayings', { p_round_id: roundId });
      await db.from('rounds').update({ state: 'distributed' }).eq('id', roundId);
      // Fire badge awards now that medals exist, so honors appear with the results
      // instead of lagging up to 10 min for the cron. Best-effort: never fail a
      // distribute over badges (the cron is the backstop).
      try { await db.rpc('recompute_badges_after_round', { p_round: roundId }); }
      catch (e) { console.error('badge recompute after distribute failed (cron will retry)', String(e)); }
    },
  };
}
