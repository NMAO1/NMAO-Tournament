// =====================================================================
// EDGE FUNCTION: partner-reset-link  (§AMBASSADOR — dashboard link revoke)
// Rotate an ambassador's dashboard_token → the old partner.html?t=... link stops
// working; returns the fresh token so staff can send the new link.
// AUTH: Verify JWT = ON. NMAO staff only.
// POST { partner_id } -> { ok, dashboard_token }
// Deploy: name = partner-reset-link, Verify JWT ON.
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
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const partnerId = String(body.partner_id || "").trim();
    if (!partnerId) return json({ ok: false, error: "partner_id is required." }, 400);
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");   // 64 hex chars
    const { data, error } = await svc.from("partners")
      .update({ dashboard_token: token }).eq("id", partnerId).select("id, dashboard_token").maybeSingle();
    if (error) return json({ ok: false, error: error.message }, 500);
    if (!data) return json({ ok: false, error: "Ambassador not found." }, 404);
    return json({ ok: true, dashboard_token: data.dashboard_token });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
