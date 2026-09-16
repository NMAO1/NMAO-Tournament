// purge-expired-videos — retention purge for minors' competition + duel videos.
// Keeps videos while the account is active, plus a retention window (default 12
// months); once a competitor's account has been inactive that long, its videos
// are removed from the private entry-videos bucket and the DB references nulled.
// Honors media-release §4 / privacy.html / COPPA §312.10.
//
// SAFETY: runs in DRY-RUN by default (app_settings.video_retention_dry_run=true)
// — it only LOGS + returns what it WOULD delete. Set that setting to false to
// enable real deletion. Cron-gated via x-cron-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const toKey = (v: unknown) => (v ? String(v).replace(/^.*\/entry-videos\//, "").split("?")[0] : null);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  // settings
  const { data: setRows } = await svc.from("app_settings").select("key, value")
    .in("key", ["video_retention_months", "video_retention_dry_run"]);
  const settings = Object.fromEntries((setRows ?? []).map((r: any) => [r.key, r.value]));
  const months = Number(settings["video_retention_months"] ?? 12) || 12;
  const dryRun = settings["video_retention_dry_run"] !== false; // default TRUE (safe)

  // competitors inactive >= window
  const { data: inactive, error } = await svc.rpc("inactive_competitors", { p_months: months });
  if (error) return json({ ok: false, error: error.message }, 500);
  const ids = (inactive ?? []).map((r: any) => r.competitor_id as string);
  if (!ids.length) return json({ ok: true, dry_run: dryRun, months, inactive_competitors: 0, videos_found: 0, deleted: 0 });

  // gather video keys (entries + duels) belonging to those competitors
  const keys = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data: ent } = await svc.from("entries").select("video_url, video_url_2").in("competitor_id", chunk);
    for (const e of (ent ?? []) as any[]) { const a = toKey(e.video_url); const b = toKey(e.video_url_2); if (a) keys.add(a); if (b) keys.add(b); }
    const { data: du } = await svc.from("duels")
      .select("challenger_id, opponent_id, challenger_video, opponent_video")
      .or(`challenger_id.in.(${chunk.join(",")}),opponent_id.in.(${chunk.join(",")})`);
    for (const d of (du ?? []) as any[]) {
      if (chunk.includes(d.challenger_id)) { const k = toKey(d.challenger_video); if (k) keys.add(k); }
      if (chunk.includes(d.opponent_id))   { const k = toKey(d.opponent_video);   if (k) keys.add(k); }
    }
  }
  const keyList = [...keys];

  if (dryRun) {
    console.log(`[retention DRY-RUN] would purge ${keyList.length} videos for ${ids.length} inactive competitors (>=${months}mo). sample keys:`, keyList.slice(0, 10));
    return json({ ok: true, dry_run: true, months, inactive_competitors: ids.length, videos_found: keyList.length, deleted: 0, sample: keyList.slice(0, 10) });
  }

  // LIVE: remove storage objects (chunked), then null the DB references.
  let deleted = 0;
  for (let i = 0; i < keyList.length; i += 100) {
    const batch = keyList.slice(i, i + 100);
    try { const { data } = await svc.storage.from("entry-videos").remove(batch); deleted += (data ?? []).length; }
    catch (e) { console.error("retention remove batch failed", e); }
  }
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await svc.from("entries").update({ video_url: null, video_url_2: null }).in("competitor_id", chunk);
    await svc.from("duels").update({ challenger_video: null }).in("challenger_id", chunk);
    await svc.from("duels").update({ opponent_video: null }).in("opponent_id", chunk);
  }
  console.log(`[retention LIVE] purged ${deleted}/${keyList.length} videos for ${ids.length} inactive competitors (>=${months}mo).`);
  return json({ ok: true, dry_run: false, months, inactive_competitors: ids.length, videos_found: keyList.length, deleted });
});
