// =====================================================================
// EDGE FUNCTION: social-cadence
// Auto-schedules APPROVED posts onto a steady weekly drip. Reads
// social_settings (auto_schedule + slots), assigns each eligible post the next
// open future slot, sets scheduled_at, and calls social-publish (cron secret)
// to schedule it via Postiz. Consent-gated posts are skipped until confirmed.
//
// Runs from pg_cron (auto_schedule must be ON) or from staff with { force:true }.
// Env: CRON_SECRET (to call social-publish server-to-server).
// POST { force? } -> { ok, scheduled, skipped? }
// DEPLOY: name = social-cadence, Verify JWT OFF (does its own auth).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

function upcomingSlots(slots: any[], days = 28): number[] {
  const now = Date.now(); const out: number[] = [];
  for (let d = 0; d < days; d++) {
    const base = new Date(now + d * 86400000);
    const dow = base.getUTCDay();
    for (const s of slots || []) {
      if (Number(s.dow) === dow) {
        const dt = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(s.h) || 20, 0, 0);
        if (dt > now + 3600000) out.push(dt); // ≥1h ahead
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}
const hourKey = (ms: number) => Math.round(ms / 3600000);

async function schedulePost(postId: string): Promise<boolean> {
  try {
    const r = await fetch(`${URL_}/functions/v1/social-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
      body: JSON.stringify({ post_id: postId }),
    });
    const j = await r.json().catch(() => ({} as any));
    return j?.ok === true;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const isCron = CRON_SECRET.length > 0 && (req.headers.get("x-cron-secret") || "") === CRON_SECRET;
  if (!isCron) {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
    const auth = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
    const { data: u } = await auth.auth.getUser();
    if (!u?.user?.id) return json({ ok: false, error: "Invalid session." }, 401);
    const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
    if (!staff) return json({ ok: false, error: "Staff only." }, 403);
    const { data: cap } = await svc.rpc("staff_can_uid", { p_uid: u.user.id, p_slice: "social", p_level: "full" });
    if (!cap) return json({ ok: false, error: "Not authorized — requires the Social role." }, 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;
    const { data: st } = await svc.from("social_settings").select("*").eq("id", 1).maybeSingle();
    if (!(st as any)?.auto_schedule && !force) return json({ ok: true, scheduled: 0, skipped: "auto_schedule off" });

    const slots = upcomingSlots((st as any)?.slots || []);
    if (!slots.length) return json({ ok: true, scheduled: 0, skipped: "no upcoming slots" });

    const { data: taken } = await svc.from("social_posts").select("scheduled_at")
      .not("scheduled_at", "is", null).gt("scheduled_at", new Date().toISOString());
    const used = new Set((taken || []).map((r: any) => hourKey(new Date(r.scheduled_at).getTime())));

    const { data: posts } = await svc.from("social_posts").select("id")
      .eq("status", "approved").is("scheduled_at", null)
      .or("needs_consent.eq.false,consent_confirmed.eq.true")
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true }).limit(10);

    let scheduled = 0;
    for (const p of (posts || [])) {
      const slot = slots.find((ms) => !used.has(hourKey(ms)));
      if (!slot) break;
      used.add(hourKey(slot));
      await svc.from("social_posts").update({ scheduled_at: new Date(slot).toISOString() }).eq("id", (p as any).id);
      const ok = await schedulePost((p as any).id);
      if (ok) scheduled++;
      else { // publish failed — free the slot and leave the post approved for a retry
        await svc.from("social_posts").update({ scheduled_at: null }).eq("id", (p as any).id);
        used.delete(hourKey(slot));
      }
    }
    return json({ ok: true, scheduled });
  } catch (e: any) {
    console.error("social-cadence:", e?.message || e);
    return json({ ok: false, error: "Cadence run failed." }, 500);
  }
});
