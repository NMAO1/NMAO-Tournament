// =====================================================================
// EDGE FUNCTION: submit-judge-scores  (Judge app — the score write path)
// A signed-in judge submits their per-criterion scores for one entry. We verify
// the caller is the ASSIGNED judge for that entry, then reuse the tested
// submitJudgeScores() helper to persist the per-criterion rows AND compute the
// single weighted 0–100 score server-side (so the aggregate can't be forged) —
// writing submission_scores + judge_assignments.score/state so resolve is unchanged.
//
// AUTH: Verify JWT = ON. Caller must be a signed-in judge (judges.auth_user_id)
// AND assigned to the entry.
// POST { entry_id, scores: [{ criterion_code, raw_score }] } -> { ok, score }
// Deploy: supabase functions deploy submit-judge-scores --project-ref oxzuavpyoetchwebdejp
//   (CLI only — bundles ../_shared.)
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";
import { submitJudgeScores } from "../_shared/supabaseStore.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, {
    global: { headers: { Authorization: "Bearer " + bearer } },
    auth: { persistSession: false },
  });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    // Caller must be a judge, active + background-check-cleared.
    const { data: judge } = await svc
      .from("judges").select("id, status, background_check_status")
      .eq("auth_user_id", uid).maybeSingle();
    if (!judge) return json({ ok: false, error: "Not authorized — judges only." }, 403);
    if (judge.status !== "active" || judge.background_check_status !== "cleared") {
      return json({ ok: false, error: "Your judge account is not active/cleared." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const entryId = String(body.entry_id || "").trim();
    const rawScores = Array.isArray(body.scores) ? body.scores : [];
    if (!entryId || !rawScores.length) return json({ ok: false, error: "entry_id and scores are required." }, 400);

    // The caller must be the ASSIGNED judge for this entry (not submitting for someone else's pod).
    const { data: ja } = await svc
      .from("judge_assignments").select("id, state")
      .eq("entry_id", entryId).eq("judge_id", (judge as any).id).maybeSingle();
    if (!ja) return json({ ok: false, error: "You are not assigned to this entry." }, 403);

    const { data: entry } = await svc.from("entries").select("event").eq("id", entryId).single();
    if (!entry) return json({ ok: false, error: "Entry not found." }, 404);

    const scores = rawScores
      .map((s: any) => ({
        criterionCode: String(s.criterion_code ?? s.criterionCode ?? ""),
        rawScore: Number(s.raw_score ?? s.rawScore),
      }))
      .filter((s: any) => s.criterionCode && Number.isFinite(s.rawScore) && s.rawScore >= 0 && s.rawScore <= 100);
    if (!scores.length) return json({ ok: false, error: "No valid scores." }, 400);

    const weighted = await submitJudgeScores(svc, {
      entryId,
      judgeId: (judge as any).id,
      event: (entry as any).event,
      scores,
    });

    return json({ ok: true, score: weighted }, 200);
  } catch (e: any) {
    console.error("submit-judge-scores error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
