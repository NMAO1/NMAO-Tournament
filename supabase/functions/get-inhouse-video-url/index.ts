// =====================================================================
// EDGE FUNCTION: get-inhouse-video-url  (school watches an in-house entry)
// Returns a short-lived signed URL for an in-house entry's video so the school
// owner (and the competitor) can watch it in the portal / scoring carousel.
// Handles both sources: a pasted public link (returned as-is) and an uploaded
// clip in the private entry-videos bucket (signed).
//
// AUTH: Verify JWT = ON. Allowed = the tournament's school owner OR the
// entrant's own competitor / guardian.
// POST { entrant_id } -> { ok, url }   (url null if no video yet)
// Deploy (editor-safe, no _shared): name = get-inhouse-video-url, Verify JWT ON.
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
    if (!entrantId) return json({ ok: false, error: "entrant_id required." }, 400);

    const { data: ent } = await svc.from("ih_entrants").select("id, tournament_id, competitor_id, video_url").eq("id", entrantId).maybeSingle();
    if (!ent) return json({ ok: false, error: "Entry not found." }, 404);
    const videoUrl = (ent as any).video_url as string | null;
    if (!videoUrl) return json({ ok: true, url: null });

    // Authorize: school owner of the entry's tournament, or the entrant's competitor/guardian.
    const { data: t } = await svc.from("in_house_tournaments").select("school_id").eq("id", (ent as any).tournament_id).maybeSingle();
    const [{ data: owned }, { data: own }, { data: wards }] = await Promise.all([
      svc.from("schools").select("id").eq("auth_user_id", uid),
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const ownsSchool = t && ((owned ?? []) as any[]).some((s) => s.id === (t as any).school_id);
    const compSet = new Set<string>([...((own ?? []) as any[]).map((r) => r.id), ...((wards ?? []) as any[]).map((r) => r.competitor_id)]);
    const isMine = (ent as any).competitor_id && compSet.has((ent as any).competitor_id);
    if (!ownsSchool && !isMine) return json({ ok: false, error: "Not allowed." }, 403);

    // Pasted public link → return as-is. Storage path → sign it.
    if (/^https?:\/\//i.test(videoUrl)) return json({ ok: true, url: videoUrl });
    const { data: signed, error } = await svc.storage.from("entry-videos").createSignedUrl(videoUrl, 3600);
    if (error || !signed) return json({ ok: false, error: "Could not load video." }, 500);
    return json({ ok: true, url: signed.signedUrl });
  } catch (e: any) {
    console.error("get-inhouse-video-url error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
