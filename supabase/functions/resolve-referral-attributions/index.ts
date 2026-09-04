// =====================================================================
// EDGE FUNCTION: resolve-referral-attributions  (§AMBASSADOR — Phase 1.5)
// Turn captured referral slugs into real attributions. Membership records which
// ?p=<slug> a school signed up under (schools.referral_slug, ykioz); this reads
// those cross-project, matches slug -> partner, and creates the attribution in
// Tournament — FIRST-TOUCH: never overrides a school that's already attributed.
// AUTH: Verify JWT = ON. NMAO staff only. (Safe to also run from a cron later.)
// Env: SUPABASE_URL/-SERVICE_ROLE_KEY/-ANON_KEY + MEMBERSHIP_SUPABASE_URL +
//      MEMBERSHIP_SERVICE_ROLE_KEY (same secrets as accrue-partner-school-payouts).
// POST {} -> { ok, scanned, resolved, already, no_partner }
// Deploy: name = resolve-referral-attributions, Verify JWT ON.
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
    // Strip any non-printable/whitespace gremlins from pasted secrets.
    const clean = (s: string | undefined) => (s || "").replace(/[^\x21-\x7E]/g, "");
    const MU = clean(Deno.env.get("MEMBERSHIP_SUPABASE_URL"));
    const MK = clean(Deno.env.get("MEMBERSHIP_SERVICE_ROLE_KEY"));
    if (!MU || !MK) return json({ ok: false, error: "Membership DB not configured — set MEMBERSHIP_SUPABASE_URL + MEMBERSHIP_SERVICE_ROLE_KEY secrets." }, 500);
    const mem = createClient(MU, MK, { auth: { persistSession: false } });

    // Membership schools that signed up under a referral slug.
    const { data: schools, error: serr } = await mem.from("schools")
      .select("id, name, referral_slug").not("referral_slug", "is", null);
    if (serr) return json({ ok: false, error: "Membership read failed: " + serr.message }, 500);
    if (!schools?.length) return json({ ok: true, scanned: 0, resolved: 0, already: 0, no_partner: 0 });

    // Tournament partners: slug -> id.
    const { data: partners } = await svc.from("partners").select("id, slug");
    const bySlug: Record<string, string> = {};
    for (const p of (partners || [])) if ((p as any).slug) bySlug[String((p as any).slug).toLowerCase()] = (p as any).id;

    // Schools already attributed (first-touch — never override these).
    const { data: attrs } = await svc.from("partner_school_attributions").select("member_school_id").eq("active", true);
    const attributed = new Set<string>((attrs || []).map((a: any) => a.member_school_id));

    let resolved = 0, already = 0, no_partner = 0, failed = 0;
    for (const s of schools as any[]) {
      const slug = String(s.referral_slug || "").trim().toLowerCase();
      if (!slug) continue;
      if (attributed.has(s.id)) { already++; continue; }          // first-touch lock
      const pid = bySlug[slug];
      if (!pid) { no_partner++; continue; }                       // slug has no matching ambassador (yet)
      const ins = await svc.from("partner_school_attributions").insert({
        partner_id: pid, member_school_id: s.id, school_name: s.name || null,
        method: "code", note: "?p=" + slug,                       // method CHECK allows code|manual|import
      }).select("id").maybeSingle();
      if (ins.error) {
        // 23505 = unique(active) race → genuinely already attributed. Anything else is a REAL failure.
        if (String(ins.error.code) === "23505" || /duplicate|unique/i.test(ins.error.message || "")) { already++; }
        else { failed++; console.error("attribution insert failed:", s.id, ins.error.message); }
        continue;
      }
      // best-effort audit (non-critical — supabase-js returns errors, never throws here).
      await svc.from("partner_attribution_audit").insert({
        member_school_id: s.id, partner_id: pid, prev_partner_id: null,
        action: "attribute", method: "code", actor: "referral-resolver", reason: "?p=" + slug,
      });
      attributed.add(s.id);
      resolved++;
    }
    return json({ ok: true, scanned: schools.length, resolved, already, no_partner, failed });
  } catch (e: any) {
    console.error("resolve-referral-attributions error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
