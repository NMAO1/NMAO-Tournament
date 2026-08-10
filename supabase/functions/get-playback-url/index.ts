// =====================================================================
// EDGE FUNCTION: get-playback-url  (the VIDEO SEAM)
// Mints short-lived signed URLs for an entry's 1–2 angle videos, gated to
// people allowed to watch: the assigned judge, the owner competitor/guardian,
// or staff. The entry-videos bucket is PRIVATE (minors), so raw paths are never
// playable directly — this is the only way in.
//
// This is also where SPONSOR PRE-ROLL hooks in later: the response carries a
// `preroll` field (null today). When sponsorship ships, resolve the active
// sponsor asset here and return its signed URL + duration; the client plays it
// before the entry. Swapping storage → Mux later only changes this function.
//
// AUTH: Verify JWT = ON.
// POST { entry_id } -> { ok, angle1, angle2, preroll, expires_in }
// Deploy: supabase functions deploy get-playback-url --project-ref oxzuavpyoetchwebdejp
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "entry-videos";
const TTL = 3600; // 1 hour — long enough for a judging session

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// A stored value is either a full URL (demo/sample clips) or a bucket path.
async function resolve(svc: any, val: string | null): Promise<string | null> {
  if (!val) return null;
  if (/^https?:\/\//i.test(val)) return val; // already a URL — pass through
  const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(val, TTL);
  if (error) { console.error("sign error:", error, val); return null; }
  return data?.signedUrl ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, {
    global: { headers: { Authorization: "Bearer " + bearer } },
    auth: { persistSession: false },
  });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const entryId = String(body.entry_id || "").trim();
    if (!entryId) return json({ ok: false, error: "entry_id is required." }, 400);

    const { data: entry } = await svc.from("entries").select("competitor_id, video_url, video_url_2").eq("id", entryId).maybeSingle();
    if (!entry) return json({ ok: false, error: "Entry not found." }, 404);

    // Who is the caller? staff / owner-or-guardian / assigned judge.
    const [{ data: staff }, { data: judge }, { data: own }, { data: wards }] = await Promise.all([
      svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle(),
      svc.from("judges").select("id").eq("auth_user_id", uid).maybeSingle(),
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);

    let allowed = !!staff;
    if (!allowed) {
      const mine = new Set<string>([
        ...((own ?? []) as any[]).map((r) => r.id),
        ...((wards ?? []) as any[]).map((r) => r.competitor_id),
      ]);
      if (mine.has((entry as any).competitor_id)) allowed = true;
    }
    if (!allowed && judge) {
      const { data: ja } = await svc.from("judge_assignments").select("id")
        .eq("entry_id", entryId).eq("judge_id", (judge as any).id).maybeSingle();
      if (ja) allowed = true;
    }
    if (!allowed) return json({ ok: false, error: "Not authorized to view this video." }, 403);

    const [angle1, angle2] = await Promise.all([
      resolve(svc, (entry as any).video_url),
      resolve(svc, (entry as any).video_url_2),
    ]);

    // SPONSOR PRE-ROLL SEAM — null until sponsorship ships. When it does, resolve
    // the active sponsor asset here: { url: <signed>, seconds: <n>, sponsor: <name> }.
    const preroll = null;

    return json({ ok: true, angle1, angle2, preroll, expires_in: TTL }, 200);
  } catch (e: any) {
    console.error("get-playback-url error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
