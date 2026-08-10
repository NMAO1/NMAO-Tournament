// =====================================================================
// EDGE FUNCTION: submit-entry  (Competitor app — Compete)
// A signed-in competitor (or their guardian) registers an entry for the open
// round after uploading 1–2 angle videos to the entry-videos bucket.
//
// The client uploads to storage first (RLS-scoped to its own <competitor_id>/
// folder), then calls this with the resulting storage PATHS. We compute the
// trust-sensitive fields server-side — age_bracket (from dob), declared_rank
// (from the profile), rating_at_entry (from skill_ratings) — so the client
// can't spoof what feeds divisioning/seeding. Upserts on (round, competitor,
// event) so re-submitting replaces the videos.
//
// AUTH: Verify JWT = ON.
// POST { competitor_id, event, video_path, video_path_2?, round_id? }
//   -> { ok, entry_id, age_bracket, event, round_id }
// Deploy: supabase functions deploy submit-entry --project-ref oxzuavpyoetchwebdejp
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const ACCEPTING = ["open", "collecting"];               // round states that accept entries
const SCHEME_TIERS = ["beginner", "intermediate", "advanced"]; // black_belt collapses to advanced

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function ageOn(dob: string, on: Date): number {
  const d = new Date(dob + "T00:00:00Z");
  let a = on.getUTCFullYear() - d.getUTCFullYear();
  const m = on.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < d.getUTCDate())) a--;
  return a;
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
    const competitorId = String(body.competitor_id || "").trim();
    const event = String(body.event || "").trim();
    const videoPath = String(body.video_path || "").trim();
    const videoPath2 = body.video_path_2 ? String(body.video_path_2).trim() : null;
    if (!competitorId || !event || !videoPath) {
      return json({ ok: false, error: "competitor_id, event and video_path are required." }, 400);
    }

    // Caller's competitor set (self + any children they guardian) — mirrors nmao.competitor_ids().
    const [{ data: own }, { data: wards }] = await Promise.all([
      svc.from("competitors").select("id").eq("auth_user_id", uid),
      svc.from("guardian_competitors").select("competitor_id, guardians!inner(auth_user_id)").eq("guardians.auth_user_id", uid),
    ]);
    const allowed = new Set<string>([
      ...((own ?? []) as any[]).map((r) => r.id),
      ...((wards ?? []) as any[]).map((r) => r.competitor_id),
    ]);
    if (!allowed.has(competitorId)) return json({ ok: false, error: "Not your competitor profile." }, 403);

    // Uploaded files must live under this competitor's own folder.
    if (!videoPath.startsWith(competitorId + "/") || (videoPath2 && !videoPath2.startsWith(competitorId + "/"))) {
      return json({ ok: false, error: "Video path must be under your own folder." }, 400);
    }

    // Event must be a real event type.
    const { data: et } = await svc.from("event_types").select("code").eq("code", event).maybeSingle();
    if (!et) return json({ ok: false, error: "Unknown event." }, 400);

    // Round: explicit, else the current accepting round.
    let roundId = body.round_id ? String(body.round_id).trim() : "";
    if (roundId) {
      const { data: r } = await svc.from("rounds").select("id, state").eq("id", roundId).maybeSingle();
      if (!r) return json({ ok: false, error: "Round not found." }, 404);
      if (!ACCEPTING.includes((r as any).state)) return json({ ok: false, error: "That round is not accepting entries." }, 409);
    } else {
      const { data: open } = await svc.from("rounds").select("id, state")
        .in("state", ACCEPTING).order("opens_at", { ascending: false }).limit(1).maybeSingle();
      if (!open) return json({ ok: false, error: "No round is open for entries right now." }, 409);
      roundId = (open as any).id;
    }

    // Competitor profile -> age bracket, rank, rating (server-computed).
    const { data: comp } = await svc.from("competitors").select("dob, declared_rank").eq("id", competitorId).single();
    if (!comp) return json({ ok: false, error: "Competitor not found." }, 404);
    const rankRaw = (comp as any).declared_rank as string | null;
    if (!rankRaw) return json({ ok: false, error: "Set your rank on your profile before entering." }, 409);
    const rank = SCHEME_TIERS.includes(rankRaw) ? rankRaw : rankRaw === "black_belt" ? "advanced" : rankRaw;

    const age = ageOn((comp as any).dob, new Date());
    const { data: brackets } = await svc.from("age_brackets").select("code, min_age, max_age");
    const bracket = (brackets ?? []).find((b: any) => age >= b.min_age && (b.max_age == null || age <= b.max_age));
    if (!bracket) return json({ ok: false, error: `No age bracket for age ${age}.` }, 409);

    const { data: sr } = await svc.from("skill_ratings").select("rating").eq("competitor_id", competitorId).maybeSingle();
    const ratingAtEntry = sr ? Number((sr as any).rating) : 50;

    const { data: entry, error: eerr } = await svc.from("entries").upsert({
      round_id: roundId,
      competitor_id: competitorId,
      event,
      age_bracket: (bracket as any).code,
      declared_rank: rank,
      rating_at_entry: ratingAtEntry,
      video_url: videoPath,
      video_url_2: videoPath2,
      status: "submitted",
      updated_at: new Date().toISOString(),
    }, { onConflict: "round_id,competitor_id,event" }).select("id").single();
    if (eerr) { console.error("submit-entry upsert:", eerr); return json({ ok: false, error: "Could not save entry." }, 500); }

    return json({ ok: true, entry_id: (entry as any).id, age_bracket: (bracket as any).code, event, round_id: roundId }, 200);
  } catch (e: any) {
    console.error("submit-entry error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
