// =====================================================================
// EDGE FUNCTION: recuse-assignment  (Judge app — pull/claim model)
// A judge recuses from a pod they claimed (conflict of interest). In the pull
// model this simply RELEASES their seat(s) back into the judging pool — every
// unsubmitted assignment they hold on that pod is removed, so the pod reopens
// for another available judge to claim. No staff step, no reassignment logic.
//
// AUTH: Verify JWT = ON. Caller must hold an (unsubmitted) assignment on the entry.
// POST { entry_id } -> { ok, released_to_pool: true }
// Deploy (editor-safe, no _shared): function name = recuse-assignment, Verify JWT ON.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, {
    global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false },
  });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const entryId = String(body.entry_id || "").trim();
    if (!entryId) return json({ ok: false, error: "entry_id is required." }, 400);

    const { data: judge } = await svc.from("judges").select("id").eq("auth_user_id", uid).maybeSingle();
    if (!judge) return json({ ok: false, error: "Not authorized — judges only." }, 403);
    const judgeId = (judge as any).id;

    const { data: ja } = await svc.from("judge_assignments")
      .select("id, state, pod_id").eq("entry_id", entryId).eq("judge_id", judgeId).maybeSingle();
    if (!ja) return json({ ok: false, error: "You are not assigned to this entry." }, 403);
    if ((ja as any).state === "submitted") {
      return json({ ok: false, error: "You've already submitted a score. Ask staff to reopen it before recusing." }, 409);
    }
    const podId = (ja as any).pod_id;

    // Release the judge's unsubmitted seat(s) on this pod back into the pool.
    if (podId) {
      await svc.from("judge_assignments").delete()
        .eq("pod_id", podId).eq("judge_id", judgeId).neq("state", "submitted");
    } else {
      await svc.from("judge_assignments").delete().eq("id", (ja as any).id);
    }

    try {
      const { data: entry } = await svc.from("entries").select("round_id").eq("id", entryId).maybeSingle();
      await svc.from("engine_audit").insert({
        round_id: entry ? (entry as any).round_id : null, actor_id: null, action: "recuse",
        before: { entry_id: entryId, judge_id: judgeId, pod_id: podId }, after: { released_to_pool: true },
      });
    } catch { /* ignore */ }

    return json({ ok: true, released_to_pool: true }, 200);
  } catch (e: any) {
    console.error("recuse-assignment error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
