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
//   all    = divide, then the tail
//
// AUTHORIZATION: the engine runs as the service role and bypasses RLS, so
// this entrypoint MUST gate the caller. Allowed callers:
//   1. Internal / cron — Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>.
//   2. NMAO staff — a signed-in user with a row in `staff` (nmao.is_staff()).
// Everyone else gets 401/403. Without this, anyone who can POST could run
// divide/resolve/distribute and trigger payouts.
//
// Deploy: supabase functions deploy round-controller
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createSupabaseStore } from '../_shared/supabaseStore.ts';
import { stepDivide, stepAssignJudges, stepResolve, stepDistribute, runPipelineTail } from '../_shared/engine.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Service-role caller (cron/internal) OR an authenticated NMAO staff member.
async function authorize(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // 1) Internal / scheduled caller presenting the service-role key.
  if (bearer && serviceKey && bearer === serviceKey) return { ok: true };

  // 2) A signed-in user — confirm the token, then confirm they are staff.
  if (!bearer) return { ok: false, status: 401, error: 'Sign in required.' };

  const url = Deno.env.get('SUPABASE_URL')!;
  const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: 'Bearer ' + bearer } },
    auth: { persistSession: false },
  });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return { ok: false, status: 401, error: 'Invalid or expired session.' };

  // Look up staff with the service role so this check never depends on RLS.
  const svc = createClient(url, serviceKey!, { auth: { persistSession: false } });
  const { data: staff } = await svc.from('staff').select('id, role').eq('auth_user_id', uid).maybeSingle();
  if (!staff) return { ok: false, status: 403, error: 'Not authorized — NMAO staff only.' };

  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const az = await authorize(req);
  if (!az.ok) return json({ error: az.error }, az.status);

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
    console.error('round-controller error', { roundId, step, err: String(err) });
    return json({ ok: false, roundId, step, error: String(err) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
