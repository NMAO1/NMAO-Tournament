// =====================================================================
// EDGE FUNCTION: marketing-attribution
// Closed-loop attribution for Mission Control: reads the Membership funnel
// (leads -> trials -> enrollments + attributed active-membership value) by
// campaign and by school, so social/paid effort can be tied to real enrollments.
//
// Tournament-staff-gated (Social role). Reads the Membership project via the
// existing cross-project secrets (MEMBERSHIP_SUPABASE_URL / _SERVICE_ROLE_KEY),
// calling that project's marketing_attribution_rollup() RPC. Read-only.
//
// DEPLOY: name = marketing-attribution, Verify JWT OFF (does its own auth).
// POST { days? } -> { ok, rollup } | { ok:false, error }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MEM_URL = Deno.env.get("MEMBERSHIP_SUPABASE_URL") || "";
const MEM_SERVICE = Deno.env.get("MEMBERSHIP_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // gate: signed-in Tournament staff with the Social role
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const auth = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return json({ ok: false, error: "Invalid session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
  if (!staff) return json({ ok: false, error: "Staff only." }, 403);
  const { data: cap } = await svc.rpc("staff_can_uid", { p_uid: u.user.id, p_slice: "social", p_level: "full" });
  if (!cap) return json({ ok: false, error: "Not authorized — requires the Social role." }, 403);

  if (!MEM_URL || !MEM_SERVICE) {
    return json({ ok: false, code: "not_configured", error: "Membership link isn't configured (MEMBERSHIP_SUPABASE_URL / _SERVICE_ROLE_KEY)." }, 200);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(3650, Math.max(1, Number(body.days) || 365));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const mem = createClient(MEM_URL, MEM_SERVICE, { auth: { persistSession: false } });
    const { data, error } = await mem.rpc("marketing_attribution_rollup", { p_since: since });
    if (error) return json({ ok: false, error: error.message }, 200);
    return json({ ok: true, rollup: data });
  } catch (e: any) {
    console.error("marketing-attribution:", e?.message || e);
    return json({ ok: false, error: "Attribution read failed. Please try again." }, 500);
  }
});
