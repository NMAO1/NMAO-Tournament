// =====================================================================
// EDGE FUNCTION: onboard-competitor  (Competitor app — guardian signup)
// Guardian-first onboarding. The signed-in GUARDIAN registers a competitor:
// creates/updates their guardian record, inserts the competitor, links them,
// records the consents, and enrolls the competitor in a season (mandatory).
// Entry PAYMENT is separate (create-entry-checkout), per-event.
//
// AUTH: Verify JWT = ON. The guardian is derived from the JWT.
// POST {
//   guardian: { first_name, last_name, phone? },
//   competitor: { first_name, last_name, dob, school_id?, declared_rank, declared_style, profile_photo_url? },
//   season_id, consent_types: string[]
// } -> { ok, competitor_id, guardian_id }
// Deploy (editor-safe, no _shared): name = onboard-competitor, Verify JWT ON.
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
const norm = (s: string) => s.trim().toLowerCase();
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  const email = u?.user?.email || "";
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const g = body.guardian || {};
    const c = body.competitor || {};
    const seasonId = String(body.season_id || "").trim();
    const consentTypes: string[] = Array.isArray(body.consent_types) ? body.consent_types.map((s: any) => String(s)) : [];

    // ---- validate ----
    if (!c.first_name?.trim() || !c.last_name?.trim()) return json({ ok: false, error: "Competitor first and last name are required." }, 400);
    if (!isDate(String(c.dob || ""))) return json({ ok: false, error: "A valid date of birth (YYYY-MM-DD) is required." }, 400);
    if (!seasonId) return json({ ok: false, error: "A season choice is required." }, 400);
    if (consentTypes.length === 0) return json({ ok: false, error: "Guardian consent is required to register." }, 400);

    const { data: season } = await svc.from("seasons").select("id, status").eq("id", seasonId).maybeSingle();
    if (!season) return json({ ok: false, error: "That season no longer exists." }, 400);
    if ((season as any).status === "archived") return json({ ok: false, error: "That season is closed." }, 400);

    // ---- guardian: find by auth user, else create ----
    let guardianId: string;
    const { data: existing } = await svc.from("guardians").select("id").eq("auth_user_id", uid).maybeSingle();
    if (existing) {
      guardianId = (existing as any).id;
      await svc.from("guardians").update({
        first_name: g.first_name?.trim() || undefined,
        last_name: g.last_name?.trim() || undefined,
        phone: g.phone?.trim() || undefined,
      }).eq("id", guardianId);
    } else {
      const { data: ins, error: gErr } = await svc.from("guardians").insert({
        first_name: (g.first_name || "").trim(), last_name: (g.last_name || "").trim(),
        email, phone: (g.phone || "").trim() || null, auth_user_id: uid, // email_norm is generated
      }).select("id").single();
      if (gErr) return json({ ok: false, error: "Could not create guardian record." }, 500);
      guardianId = (ins as any).id;
    }

    // ---- invite redeem (Membership bridge): when an invite_token is present,
    // school + rank + external id come from the PENDING record. The school owns
    // rank, so any guardian-supplied rank is ignored on this path. ----
    const inviteToken = String(body.invite_token || "").trim();
    let pendingId: string | null = null, extStudentId: string | null = null, inviteRank: string | null = null, inviteSchoolId: string | null = null;
    if (inviteToken) {
      const { data: pend } = await svc.from("bridge_pending_athletes").select("id, school_id, external_member_student_id, declared_rank, status, expires_at").eq("invite_token", inviteToken).maybeSingle();
      if (!pend) return json({ ok: false, error: "This invite could not be found." }, 400);
      if ((pend as any).status !== "pending") return json({ ok: false, error: "This invite has already been used." }, 400);
      if ((pend as any).expires_at && new Date((pend as any).expires_at) < new Date()) return json({ ok: false, error: "This invite has expired." }, 400);
      pendingId = (pend as any).id; extStudentId = (pend as any).external_member_student_id;
      inviteRank = (pend as any).declared_rank; inviteSchoolId = (pend as any).school_id;
    }

    // ---- competitor ----
    const { data: comp, error: cErr } = await svc.from("competitors").insert({
      school_id: inviteToken ? inviteSchoolId : (c.school_id || null),
      first_name: c.first_name.trim(), last_name: c.last_name.trim(),
      dob: c.dob, declared_style: (c.declared_style || "").trim() || null,
      declared_rank: inviteToken ? inviteRank : ((c.declared_rank || "").trim() || null),
      external_member_student_id: extStudentId,
      profile_photo_url: (c.profile_photo_url || "").trim() || null,
      status: "active",
    }).select("id").single();
    if (cErr || !comp) return json({ ok: false, error: "Could not create competitor." }, 500);
    const competitorId = (comp as any).id;

    // ---- link + consents + enrollment ----
    await svc.from("guardian_competitors").upsert(
      { guardian_id: guardianId, competitor_id: competitorId, relationship: (body.relationship || "guardian") },
      { onConflict: "guardian_id,competitor_id" },
    );
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const consentRows = consentTypes.map((t) => ({ competitor_id: competitorId, guardian_id: guardianId, type: t, agreed_at: new Date().toISOString(), ip }));
    if (consentRows.length) {
      const { error: consentErr } = await svc.from("consents").insert(consentRows);
      if (consentErr) return json({ ok: false, error: "Could not record guardian consent." }, 500);
    }
    await svc.from("season_enrollments").upsert(
      { competitor_id: competitorId, season_id: seasonId, status: "enrolled" },
      { onConflict: "competitor_id,season_id" },
    );

    // ---- mark the invite redeemed (bridge) ----
    if (inviteToken && pendingId) {
      await svc.from("bridge_pending_athletes").update(
        { status: "redeemed", competitor_id: competitorId, redeemed_at: new Date().toISOString() },
      ).eq("id", pendingId);
    }

    return json({ ok: true, competitor_id: competitorId, guardian_id: guardianId });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." }, 500);
  }
});
