// =====================================================================
// EDGE FUNCTION: partner-assign  (§AMBASSADOR — Phase 1)
// Assign / REASSIGN a school to an ambassador — the admin override of the
// first-touch lock (offline/phone deals, corrections). Audit-logged. Keyed on
// the MEMBERSHIP school id (universal unit).
// AUTH: Verify JWT = ON. Caller must be NMAO staff (same gate as pay-judges).
// POST { member_school_id (required), partner_id | partner_slug (one required),
//        school_name?, tournament_school_id?, reason? }
//   -> { ok, member_school_id, partner, reassigned }
// Deploy: name = partner-assign, Verify JWT ON.
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
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const memberSchoolId = String(body.member_school_id || "").trim();
    if (!memberSchoolId) return json({ ok: false, error: "member_school_id is required." }, 400);
    const reason = body.reason ? String(body.reason) : null;
    const schoolName = body.school_name ? String(body.school_name) : null;
    const tournamentSchoolId = body.tournament_school_id ? String(body.tournament_school_id) : null;

    // Resolve the target partner by id or slug.
    let q = svc.from("partners").select("id, slug, status");
    if (body.partner_id) q = q.eq("id", String(body.partner_id).trim());
    else if (body.partner_slug) q = q.eq("slug", String(body.partner_slug).trim().toLowerCase());
    else return json({ ok: false, error: "partner_id or partner_slug is required." }, 400);
    const { data: partner } = await q.maybeSingle();
    if (!partner) return json({ ok: false, error: "Partner not found." }, 404);

    // Current active attribution for this membership school (if any).
    const { data: cur } = await svc.from("partner_school_attributions")
      .select("id, partner_id").eq("member_school_id", memberSchoolId).eq("active", true).maybeSingle();

    if (cur && cur.partner_id === partner.id) {
      return json({ ok: true, unchanged: true, member_school_id: memberSchoolId, partner: { id: partner.id, slug: partner.slug } });
    }

    // End the current attribution first so the one-active-per-school index stays satisfied.
    if (cur) {
      await svc.from("partner_school_attributions")
        .update({ active: false, ended_at: new Date().toISOString() }).eq("id", cur.id);
    }

    const ins = await svc.from("partner_school_attributions")
      .insert({
        partner_id: partner.id, member_school_id: memberSchoolId, tournament_school_id: tournamentSchoolId,
        school_name: schoolName, method: "manual", note: reason,
      })
      .select("id").maybeSingle();
    if (ins.error) return json({ ok: false, error: ins.error.message }, 500);

    await svc.from("partner_attribution_audit").insert({
      member_school_id: memberSchoolId, partner_id: partner.id, prev_partner_id: cur ? cur.partner_id : null,
      action: cur ? "reassign" : "attribute", method: "manual", actor: "staff:" + uid, reason,
    });

    return json({ ok: true, member_school_id: memberSchoolId, partner: { id: partner.id, slug: partner.slug }, reassigned: !!cur });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
