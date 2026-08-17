// =====================================================================
// EDGE FUNCTION: accept-judge-terms  (Judge app — sign the agreements)
// Records a judge's acceptance of the onboarding agreements and returns the
// current onboarding checklist. Stamps server-side timestamps (the legal
// record). A judge becomes status='active' once bg cleared + IC + creed +
// payouts are all satisfied.
//   ic          -> Independent Contractor Agreement
//   creed       -> Judge Creed / code of conduct
//   bg_consent  -> FCRA background-check disclosure + authorization
//
// AUTH: Verify JWT = ON. Caller must be a judge.
// POST { ic?, creed?, bg_consent? } -> { ok, checklist, judge_status }
// Deploy: name = accept-judge-terms, Verify JWT ON.
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
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const b = await req.json().catch(() => ({}));
    const { data: judge } = await svc.from("judges").select("id, status").eq("auth_user_id", uid).maybeSingle();
    if (!judge) return json({ ok: false, error: "Not authorized — judges only." }, 403);
    const judgeId = (judge as any).id;

    const now = new Date().toISOString();
    const patch: Record<string, string> = {};
    if (b.ic) patch.ic_agreement_accepted_at = now;
    if (b.creed) patch.creed_accepted_at = now;
    if (b.bg_consent) patch.bg_consent_at = now;
    if (Object.keys(patch).length) await svc.from("judges").update(patch).eq("id", judgeId);

    // Re-read and (maybe) activate.
    const { data: j } = await svc.from("judges").select("status, background_check_status, ic_agreement_accepted_at, creed_accepted_at, bg_consent_at, payouts_enabled").eq("id", judgeId).single();
    const jj = j as any;
    const ready = jj.status !== "rejected" && jj.background_check_status === "cleared" && !!jj.ic_agreement_accepted_at && !!jj.creed_accepted_at && !!jj.payouts_enabled;
    let jstatus = jj.status;
    if (ready && jj.status !== "active") { await svc.from("judges").update({ status: "active" }).eq("id", judgeId); jstatus = "active"; }

    return json({
      ok: true,
      judge_status: jstatus,
      checklist: {
        bg_consent: !!jj.bg_consent_at,
        bg_cleared: jj.background_check_status === "cleared",
        ic_agreement: !!jj.ic_agreement_accepted_at,
        creed: !!jj.creed_accepted_at,
        payouts: !!jj.payouts_enabled,
      },
    });
  } catch (e: any) {
    console.error("accept-judge-terms error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
