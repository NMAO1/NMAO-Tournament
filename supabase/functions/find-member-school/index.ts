// =====================================================================
// EDGE FUNCTION: find-member-school
// Staff search helper for the Mission Control "Attribute a school" panel:
// look up a Membership (ykioz) school by name or email so staff can attribute
// it to an ambassador WITHOUT hunting down the raw member-school UUID.
// Cross-project read of Membership schools; returns id + name + email +
// whether it already carries a referral_slug / is already attributed here.
// AUTH: Verify JWT = ON. Caller must be NMAO staff (same gate as partner-assign).
// POST { q }  ->  { ok, results: [{ member_school_id, name, email, plan_status,
//                    referral_slug, attributed_to_slug|null }] }
// Deploy: name = find-member-school, Verify JWT ON.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (auto),
//      MEMBERSHIP_SUPABASE_URL, MEMBERSHIP_SERVICE_ROLE_KEY.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MEM_URL = Deno.env.get("MEMBERSHIP_SUPABASE_URL")!;
const MEM_SERVICE = Deno.env.get("MEMBERSHIP_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // --- staff gate (mirror partner-assign / connect-onboard-partner) ---
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
    const q = String(body.q || "").trim();
    if (q.length < 2) return json({ ok: false, error: "Type at least 2 characters." }, 400);
    // `_` and `%` are LIKE wildcards — escape so a literal search stays literal.
    const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";

    const mem = createClient(MEM_URL, MEM_SERVICE, { auth: { persistSession: false } });
    const { data: schools, error } = await mem.from("schools")
      .select("id, name, email, plan_status, referral_slug")
      .or(`name.ilike.${like},email.ilike.${like}`)
      .limit(15);
    if (error) return json({ ok: false, error: error.message }, 500);

    const ids = (schools || []).map((s: any) => s.id);
    // Which of these are already attributed here, and to whom?
    const attrMap: Record<string, string> = {};
    if (ids.length) {
      const { data: attrs } = await svc.from("partner_school_attributions")
        .select("member_school_id, partner_id, partners(slug)")
        .in("member_school_id", ids).eq("active", true);
      for (const a of (attrs || []) as any[]) {
        attrMap[a.member_school_id] = a.partners?.slug || a.partner_id;
      }
    }

    const results = (schools || []).map((s: any) => ({
      member_school_id: s.id,
      name: s.name,
      email: s.email,
      plan_status: s.plan_status,
      referral_slug: s.referral_slug || null,
      attributed_to_slug: attrMap[s.id] || null,
    }));
    return json({ ok: true, results });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Search failed." }, 500);
  }
});
