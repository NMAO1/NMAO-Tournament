// =====================================================================
// EDGE FUNCTION: list-judges  (Mission Control — Judges admin)
// Returns the judge roster (applications + onboarding state) for staff review.
// AUTH: service-role key OR a signed-in NMAO staff member.
// POST {} -> { ok, judges: [...] }
// Deploy: name = list-judges, Verify JWT ON.
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

  const { data, error } = await svc.from("judges")
    .select("id, first_name, last_name, email, status, background_check_status, bg_consent_at, ic_agreement_accepted_at, creed_accepted_at, payouts_enabled, hourly_rate_cents, years_experience, styles, school_id, application, applied_at, certified_at, created_at")
    .order("applied_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, judges: data ?? [] });
});
