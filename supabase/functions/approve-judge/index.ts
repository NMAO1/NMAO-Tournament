// =====================================================================
// EDGE FUNCTION: approve-judge  (Staff — approve an application + invite)
// A pending judge application, once reviewed, is approved here: sets the pay
// rate + (optional) school affiliation, creates the judge's auth account, and
// generates a password SETUP link (Supabase recovery) to email them. The judge
// then completes bg consent + IC agreement + creed + payouts in-app; they reach
// status='active' only when all of those are satisfied.
//
// AUTH: service-role key (internal) OR a signed-in NMAO staff member.
// POST { judge_id, hourly_rate_cents?, school_id?, redirect_to? }
//   -> { ok, judge_status, setup_link }
// Deploy: name = approve-judge, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = (Deno.env.get("SITE_URL") || "https://example.com").replace(/\/$/, "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function authorizeStaff(bearer: string, svc: any): Promise<boolean> {
  if (bearer && bearer === SERVICE) return true;
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return false;
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  return !!staff;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  if (!(await authorizeStaff(bearer, svc))) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const b = await req.json().catch(() => ({}));
    const judgeId = String(b.judge_id || "").trim();
    if (!judgeId) return json({ ok: false, error: "judge_id is required." }, 400);
    const redirectTo = String(b.redirect_to || "").trim() || `${SITE}/judge`;

    const { data: judge } = await svc.from("judges").select("id, email, status, auth_user_id").eq("id", judgeId).maybeSingle();
    if (!judge) return json({ ok: false, error: "Judge not found." }, 404);
    const email = (judge as any).email as string;
    if (!email) return json({ ok: false, error: "This judge has no email on file." }, 400);

    // Approve: set rate/school, mark approved + certified.
    const upd: Record<string, unknown> = { status: "approved", certified_at: new Date().toISOString() };
    if (Number.isFinite(Number(b.hourly_rate_cents))) upd.hourly_rate_cents = Math.max(0, Math.floor(Number(b.hourly_rate_cents)));
    if (b.school_id) upd.school_id = String(b.school_id);
    await svc.from("judges").update(upd).eq("id", judgeId);

    // Ensure an auth account exists.
    let authUserId = (judge as any).auth_user_id as string | null;
    if (!authUserId) {
      const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "judge" } });
      if (created?.user) authUserId = created.user.id; // if it already existed, generateLink below still resolves the user
    }

    // Generate the password SETUP link (recovery). Supabase will also email it if SMTP is configured.
    const { data: linkData, error: lErr } = await svc.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (lErr) { console.error("generateLink:", lErr); return json({ ok: false, error: "Could not generate the setup link." }, 500); }
    if (!authUserId && (linkData as any)?.user?.id) authUserId = (linkData as any).user.id;
    if (authUserId && authUserId !== (judge as any).auth_user_id) await svc.from("judges").update({ auth_user_id: authUserId }).eq("id", judgeId);

    return json({ ok: true, judge_status: "approved", setup_link: (linkData as any)?.properties?.action_link ?? null });
  } catch (e: any) {
    console.error("approve-judge error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
