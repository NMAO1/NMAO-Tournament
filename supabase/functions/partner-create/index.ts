// =====================================================================
// EDGE FUNCTION: partner-create  (§AMBASSADOR — Phase 1)
// Create an Ambassador (partner) and mint a unique referral slug.
// AUTH: Verify JWT = ON. Caller must be NMAO staff (same gate as pay-judges).
// POST { name (required), email?, tier?, slug? }
//   -> { ok, partner, referral_links }
// Deploy: name = partner-create, Verify JWT ON.
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

function slugify(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ambassador";
}

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
    const name = String(body.name || "").trim();
    if (!name) return json({ ok: false, error: "name is required." }, 400);
    const email = body.email ? String(body.email).trim() : null;
    const tier = ["ambassador", "regional_director", "founding"].includes(body.tier) ? body.tier : "ambassador";

    // Race-safe unique slug (partners.slug is UNIQUE): clean, then -2, -3 …
    const base = slugify(body.slug || name);
    const candidates = [base];
    for (let i = 2; i <= 12; i++) candidates.push(base + "-" + i);
    candidates.push(base + "-" + Math.floor(Math.random() * 1e6));

    let created: any = null, lastErr: any = null;
    for (const slug of candidates) {
      const r = await svc.from("partners").insert({ name, email, slug, tier }).select("id, name, slug, tier, status").single();
      if (!r.error) { created = r.data; break; }
      lastErr = r.error;
      const dup = r.error.code === "23505" || /duplicate key|partners_slug_key/i.test(r.error.message || "");
      if (!dup) return json({ ok: false, error: r.error.message }, 500);
    }
    if (!created) return json({ ok: false, error: (lastErr && lastErr.message) || "Could not create partner." }, 500);

    return json({
      ok: true,
      partner: created,
      referral_links: {
        member:     "https://app.nmao.us/?p=" + created.slug,
        tournament: "https://league.nmao.us/?p=" + created.slug,
      },
    });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
