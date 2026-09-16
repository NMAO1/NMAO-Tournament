// EDGE FUNCTION: purge-expired-videos  (retention cron)
// -----------------------------------------------------------------------------
// Enforces the counsel-approved retention promise: a competitor's videos are
// deleted once their account has been dormant for the retention window (default
// 12 months) — no entry, duel, or login in that time. Anchored on INACTIVITY, so
// an actively-competing family keeps their progress archive. Removes the objects
// from the private entry-videos bucket AND nulls the DB references. Idempotent
// (a re-run finds no video to remove for an already-purged competitor).
//
// AUTH: x-cron-secret == CRON_SECRET. verify_jwt = false (called by pg_cron).
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const toKey = (v: unknown) => v ? String(v).replace(/^.*\/entry-videos\//, "").split("?")[0] : null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    // Window (months) from config, default 12.
    const { data: cfg } = await svc.from("app_settings").select("value").eq("key", "retention_months").maybeSingle();
    const months = Number((cfg as any)?.value) || 12;

    const { data: due, error } = await svc.rpc("competitors_past_retention", { p_months: months });
    if (error) return json({ ok: false, error: error.message }, 500);
    const ids = ((due ?? []) as any[]).map((r) => r.competitor_id);
    if (!ids.length) return json({ ok: true, months, competitors: 0, objects_removed: 0 });

    // Gather this dormant cohort's own video objects (only the competitor's own
    // side of a duel — the opponent's footage is left until they too go dormant).
    const vids: string[] = [];
    const { data: ent } = await svc.from("entries").select("competitor_id, video_url, video_url_2").in("competitor_id", ids);
    for (const e of (ent ?? []) as any[]) { const a = toKey(e.video_url); const b = toKey(e.video_url_2); if (a) vids.push(a); if (b) vids.push(b); }
    const { data: du } = await svc.from("duels")
      .select("challenger_id, opponent_id, challenger_video, opponent_video")
      .or(`challenger_id.in.(${ids.join(",")}),opponent_id.in.(${ids.join(",")})`);
    for (const d of (du ?? []) as any[]) {
      if (ids.includes(d.challenger_id)) { const k = toKey(d.challenger_video); if (k) vids.push(k); }
      if (ids.includes(d.opponent_id))   { const k = toKey(d.opponent_video);   if (k) vids.push(k); }
    }
    const keys = [...new Set(vids)];

    if (keys.length) {
      // Storage delete in chunks (the API caps how many paths per call).
      for (let i = 0; i < keys.length; i += 100) {
        try { await svc.storage.from("entry-videos").remove(keys.slice(i, i + 100)); } catch (e) { console.error("retention storage remove failed", e); }
      }
    }
    // Null the references so no path to a deleted minor's video remains.
    await svc.from("entries").update({ video_url: null, video_url_2: null }).in("competitor_id", ids);
    await svc.from("duels").update({ challenger_video: null }).in("challenger_id", ids);
    await svc.from("duels").update({ opponent_video: null }).in("opponent_id", ids);

    return json({ ok: true, months, competitors: ids.length, objects_removed: keys.length });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
