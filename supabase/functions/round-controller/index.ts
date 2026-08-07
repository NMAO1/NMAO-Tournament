// =====================================================================
// NMAO Tournament Engine — round-controller edge function (Deno / Edge)
// One entrypoint that runs a named pipeline step (or the whole tail) for a
// round. Every step is idempotent and keyed by (round_id, step), so this
// is safe to invoke from a schedule, a retry, or an operator button.
//
// POST body: { "roundId": "<uuid>", "step": "divide" | "assign_judges" |
//              "resolve" | "distribute" | "tail" | "all" }
//   divide = classify -> collapse -> form pods (writes divisions/pods)
//   tail   = assign_judges -> resolve -> distribute
//   all    = divide, then the tail (resolve only scores pods that have judge
//            scores in; run 'divide'+'assign_judges', collect scores, then
//            'resolve'+'distribute' for a real judged round)
//
// Deploy: supabase functions deploy round-controller
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createSupabaseStore } from '../_shared/supabaseStore.ts';
import { stepDivide, stepAssignJudges, stepResolve, stepDistribute, runPipelineTail } from '../_shared/engine.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  let body: { roundId?: string; step?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { roundId, step } = body;
  if (!roundId || !step) return json({ error: 'roundId and step are required' }, 400);

  const store = createSupabaseStore();

  try {
    let outcome;
    switch (step) {
      case 'divide':        outcome = await stepDivide(store, roundId); break;
      case 'assign_judges': outcome = await stepAssignJudges(store, roundId); break;
      case 'resolve':       outcome = await stepResolve(store, roundId); break;
      case 'distribute':    outcome = await stepDistribute(store, roundId); break;
      case 'tail':          outcome = await runPipelineTail(store, roundId); break;
      case 'all':           outcome = [await stepDivide(store, roundId), ...await runPipelineTail(store, roundId)]; break;
      default:              return json({ error: `unknown step: ${step}` }, 400);
    }
    return json({ ok: true, roundId, step, outcome });
  } catch (err) {
    return json({ ok: false, roundId, step, error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
