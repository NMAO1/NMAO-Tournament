// =====================================================================
// EDGE FUNCTION: my-inhouse-dues  (Competitor app — in-house "payment due")
// Returns the signed-in user's UNPAID in-house tournament entries (their own +
// their guardian wards) so the app can auto-surface a "pay now" prompt. When a
// school adds a competitor to an in-house tournament, the parent sees this
// without any link being shared. Pay itself goes through inhouse-checkout.
//
// AUTH: Verify JWT = ON. Gated to the caller's competitor set.
// POST {} -> { ok, dues: [{ entrant_id, tournament_name, event, division,
//              amount_cents, format }] }
// Deploy (editor-safe, no _shared): name = my-inhouse-dues, Verify JWT ON.
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
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const ids = Array.from(new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]));
    if (ids.length === 0) return json({ ok: true, dues: [] });

    const { data: ents } = await svc.from("ih_entrants")
      .select("id, tournament_id, event, division, competitor_id, payment_status, video_url")
      .in("competitor_id", ids);
    if (!ents || ents.length === 0) return json({ ok: true, dues: [], videos: [] });

    const tids = Array.from(new Set((ents as any[]).map((e) => e.tournament_id)));
    const { data: tours } = await svc.from("in_house_tournaments")
      .select("id, name, entry_fee_cents, format, state, prize").in("id", tids);
    const tmap = new Map((tours ?? []).map((t: any) => [t.id, t]));
    const live = (s: string) => s !== "complete" && s !== "draft"; // only created tournaments prompt

    // Two task lists, each deduped so the same event only prompts once.
    const seenDue = new Set<string>(), seenVid = new Set<string>();
    const dues: any[] = [], videos: any[] = [];
    for (const e of (ents as any[])) {
      const t = tmap.get(e.tournament_id);
      if (!t || !live(t.state)) continue;
      const fee = Number(t.entry_fee_cents || 0);
      const finalized = fee <= 0 || e.payment_status === "paid" || e.payment_status === "waived";
      const key = `${e.tournament_id}|${e.competitor_id}|${e.event ?? ""}`;
      if (e.payment_status === "unpaid" && fee > 0 && !seenDue.has(key)) {
        seenDue.add(key);
        dues.push({ entrant_id: e.id, tournament_name: t.name, event: e.event, division: e.division, amount_cents: fee, format: t.format, prize: t.prize ?? null });
      }
      // Video due: video-format tournament, entry finalized, no video submitted yet.
      if (t.format === "video" && finalized && !e.video_url && !seenVid.has(key)) {
        seenVid.add(key);
        videos.push({ entrant_id: e.id, competitor_id: e.competitor_id, tournament_name: t.name, event: e.event, division: e.division, prize: t.prize ?? null });
      }
    }
    return json({ ok: true, dues, videos });
  } catch (e: any) {
    console.error("my-inhouse-dues error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
