// =====================================================================
// EDGE FUNCTION: social-analytics
// Pulls post performance from Ayrshare for POSTED posts (those with an
// ayrshare_id) into social_posts.metrics. Staff- or cron-gated. No-ops
// cleanly until AYRSHARE_API_KEY is set. Read-only against the platforms.
//
// DEPLOY: name = social-analytics, Verify JWT OFF.
// POST { post_id? }  (omit -> refresh all posted with an ayrshare_id)
//   -> { ok, refreshed }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const AYRSHARE_KEY = Deno.env.get("AYRSHARE_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// Defensively pull common headline numbers out of Ayrshare's per-platform analytics.
function summarize(raw: any): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = ["views", "impressions", "plays", "reach", "likes", "favorites", "comments", "shares", "saved"];
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number" && keys.includes(k.toLowerCase())) {
        out[k.toLowerCase()] = (out[k.toLowerCase()] || 0) + v;
      } else if (v && typeof v === "object") walk(v);
    }
  };
  walk(raw);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const cronHdr = req.headers.get("x-cron-secret") || "";
  const isCron = CRON_SECRET.length > 0 && cronHdr === CRON_SECRET;
  if (!isCron) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
    const auth = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
    const { data: u } = await auth.auth.getUser();
    if (!u?.user?.id) return json({ ok: false, error: "Invalid session." }, 401);
    const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
    if (!staff) return json({ ok: false, error: "Staff only." }, 403);
    const { data: _cap } = await svc.rpc("staff_can_uid", { p_uid: u.user.id, p_slice: "social", p_level: "oversee" });
    if (!_cap) return json({ ok: false, error: "Not authorized for social analytics." }, 403);
  }

  if (!AYRSHARE_KEY) return json({ ok: false, code: "not_configured", refreshed: 0, error: "Analytics need AYRSHARE_API_KEY." }, 200);

  try {
    const body = await req.json().catch(() => ({}));
    const one = String(body.post_id || "").trim();
    let q = svc.from("social_posts").select("id, ayrshare_id").eq("status", "posted").not("ayrshare_id", "is", null).limit(50);
    if (one) q = svc.from("social_posts").select("id, ayrshare_id").eq("id", one) as any;
    const { data: posts } = await q;
    let refreshed = 0;
    for (const p of (posts || [])) {
      if (!(p as any).ayrshare_id) continue;
      try {
        const res = await fetch("https://api.ayrshare.com/api/analytics/post", {
          method: "POST",
          headers: { "Authorization": "Bearer " + AYRSHARE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ id: (p as any).ayrshare_id }),
        });
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) continue;
        await svc.from("social_posts").update({
          metrics: { summary: summarize(raw), raw, fetched_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq("id", (p as any).id);
        refreshed++;
      } catch (_e) { /* skip this one */ }
    }
    return json({ ok: true, refreshed });
  } catch (e: any) {
    console.error("social-analytics:", e?.message || e);
    return json({ ok: false, error: "Analytics error." }, 500);
  }
});
