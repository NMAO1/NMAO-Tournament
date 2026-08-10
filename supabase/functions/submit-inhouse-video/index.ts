// =====================================================================
// EDGE FUNCTION: submit-inhouse-video  (Competitor app — in-house video)
// After the competitor uploads their clip to the private entry-videos bucket
// (competitor-scoped storage RLS, path = "<competitor_id>/..."), the app calls
// this to record the storage path onto their in-house entry. Gated to the
// competitor / guardian — a school owner can't set this, the athlete submits it.
//
// AUTH: Verify JWT = ON.
// POST { entrant_id, video_path } -> { ok }
// Deploy (editor-safe, no _shared): name = submit-inhouse-video, Verify JWT ON.
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
    const body = await req.json().catch(() => ({}));
    const entrantId = String(body.entrant_id || "").trim();
    const videoPath = String(body.video_path || "").trim();
    if (!entrantId || !videoPath) return json({ ok: false, error: "entrant_id and video_path are required." }, 400);

    const { data: ent } = await svc.from("ih_entrants").select("id, competitor_id").eq("id", entrantId).maybeSingle();
    if (!ent) return json({ ok: false, error: "Entry not found." }, 404);

    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const allowed = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    if (!(ent as any).competitor_id || !allowed.has((ent as any).competitor_id)) return json({ ok: false, error: "Not your entry." }, 403);

    // Path must live under the competitor's own storage folder.
    if (!videoPath.startsWith(`${(ent as any).competitor_id}/`)) return json({ ok: false, error: "Invalid video path." }, 400);

    const { error } = await svc.from("ih_entrants").update({ video_url: videoPath }).eq("id", entrantId);
    if (error) return json({ ok: false, error: "Could not save your video." }, 500);
    return json({ ok: true });
  } catch (e: any) {
    console.error("submit-inhouse-video error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
