// =====================================================================
// EDGE FUNCTION: social-publish
// Sends ONE approved social post to the connected accounts via a self-hosted
// Postiz instance (Instagram Reels / TikTok / YouTube Shorts). Called from
// mc.nmao.us/social.html ("Send to platform"). Staff-gated (or cron-gated).
//
// Requires POSTIZ_URL + POSTIZ_API_KEY secrets. Until they are set, this returns
// a clear "not connected" message and changes nothing — so the rest of the queue
// (generate / approve / schedule / upload media) works without it.
//
// Optional POSTIZ_INTEGRATIONS secret: a JSON map of our platform labels to the
// Postiz integration ids, e.g. {"instagram":"<id>","youtube":"<id>","tiktok":"<id>"}.
// If a platform isn't in the map we fall back to GET /api/public/v1/integrations and
// match by provider name. Get ids via:
//   curl -s $POSTIZ_URL/api/public/v1/integrations -H "Authorization: $POSTIZ_API_KEY"
//
// Postiz public API (docs.postiz.com/public-api): auth = raw key in Authorization
// (no "Bearer"); POST /api/public/v1/upload (multipart file) -> {id,path};
// POST /api/public/v1/posts { type, date?, shortLink, tags, posts:[{integration:{id},
// value:[{content,image:[...]}], settings:{__type} }] }.
// ⚠ Exact media/settings shape can vary by Postiz version — do ONE live test post
// and tweak buildPosts()/uploadMedia() if needed (see infra/postiz/README.md).
//
// A post is publishable only when approved/scheduled AND has media_url. A future
// scheduled_at -> Postiz type "schedule" (status 'scheduled'); else "now" ('posted').
//
// DEPLOY: name = social-publish, Verify JWT OFF (does its own auth).
// POST { post_id } -> { ok, status, postiz_id?, error? }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const POSTIZ_URL = (Deno.env.get("POSTIZ_URL") || "").replace(/\/+$/, "");
const POSTIZ_KEY = Deno.env.get("POSTIZ_API_KEY") || "";
const POSTIZ_INTEGRATIONS = Deno.env.get("POSTIZ_INTEGRATIONS") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// our platform labels -> Postiz provider identifiers (used for settings.__type + matching)
const NET: Record<string, string> = {
  instagram: "instagram", tiktok: "tiktok", youtube: "youtube",
  bluesky: "bluesky", mastodon: "mastodon", threads: "threads",
  facebook: "facebook", linkedin: "linkedin", telegram: "telegram",
  x: "x", pinterest: "pinterest",
};
const pfetch = (path: string, init: RequestInit = {}) =>
  fetch(POSTIZ_URL + path, { ...init, headers: { "Authorization": POSTIZ_KEY, ...(init.headers || {}) } });

// Resolve [{platform,id,type}] triples for the given platform labels.
// `type` is Postiz's real providerIdentifier for that connected channel (e.g.
// "instagram-standalone", "bluesky", "youtube") — used as settings.__type, which
// Postiz validates against the integration. We always pull the live integrations
// list so map-configured ids still carry the correct provider type.
async function resolveIntegrations(platforms: string[]): Promise<{ platform: string; id: string; type: string }[]> {
  let map: Record<string, string> = {};
  try { map = JSON.parse(POSTIZ_INTEGRATIONS || "{}"); } catch { /* ignore */ }
  let arr: any[] = [];
  try {
    const r = await pfetch("/api/public/v1/integrations");
    const listRaw = await r.json().catch(() => []);
    arr = Array.isArray(listRaw) ? listRaw : (listRaw?.integrations || listRaw?.data || []);
  } catch { /* best-effort */ }
  const idType = new Map<string, string>();
  for (const x of arr) {
    if (x?.id) idType.set(String(x.id), String(x.providerIdentifier || x.identifier || x.provider || ""));
  }
  const pairs: { platform: string; id: string; type: string }[] = [];
  for (const pf of platforms) {
    if (map[pf]) {
      const id = String(map[pf]);
      pairs.push({ platform: pf, id, type: idType.get(id) || NET[pf] || pf });
    } else {
      const hit = arr.find((x) => String(x.providerIdentifier || x.identifier || x.provider || x.platform || x.name || "").toLowerCase().includes(pf));
      if (hit?.id) pairs.push({ platform: pf, id: String(hit.id), type: String(hit.providerIdentifier || hit.identifier || hit.provider || NET[pf] || pf) });
    }
  }
  return pairs;
}

// Upload the media into Postiz; return the media object to attach ({id,path}).
async function uploadMedia(mediaUrl: string): Promise<any | null> {
  try {
    const mr = await fetch(mediaUrl);
    if (!mr.ok) return null;
    const blob = await mr.blob();
    const name = (mediaUrl.split("?")[0].split("/").pop()) || "media.mp4";
    const fd = new FormData();
    fd.append("file", blob, name);
    const up = await pfetch("/api/public/v1/upload", { method: "POST", body: fd });
    if (!up.ok) return null;
    const j = await up.json().catch(() => ({}));
    return (j && (j.id || j.path)) ? j : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // gate: cron secret OR signed-in staff with the Social role
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
    const { data: _cap } = await svc.rpc("staff_can_uid", { p_uid: u.user.id, p_slice: "social", p_level: "full" });
    if (!_cap) return json({ ok: false, error: "Not authorized — publishing requires the Social role." }, 403);
  }

  if (!POSTIZ_URL || !POSTIZ_KEY) {
    return json({ ok: false, code: "not_configured", error: "Publishing isn't connected yet — set the POSTIZ_URL and POSTIZ_API_KEY secrets to go live." }, 200);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const postId = String(body.post_id || "").trim();
    if (!postId) return json({ ok: false, error: "post_id required." }, 400);

    const { data: p } = await svc.from("social_posts").select("*").eq("id", postId).maybeSingle();
    if (!p) return json({ ok: false, error: "Post not found." }, 404);
    if (!["approved", "scheduled"].includes((p as any).status)) {
      return json({ ok: false, error: "Approve the post before sending it to the platforms." }, 409);
    }
    if ((p as any).needs_consent && !(p as any).consent_confirmed) {
      return json({ ok: false, code: "consent_required", error: "This post shows a real student — confirm the signed media release is on file before publishing." }, 409);
    }

    const platforms = ((p as any).platforms || [])
      .map((x: string) => NET[String(x).toLowerCase()]).filter(Boolean);
    if (platforms.length === 0) return json({ ok: false, error: "No supported platforms on this post." }, 409);

    // Video platforms need a video file; text platforms (Bluesky, Mastodon, etc.) can post without one.
    const VIDEO = new Set(["instagram", "tiktok", "youtube"]);
    if (platforms.some((x) => VIDEO.has(x)) && !(p as any).media_url) {
      return json({ ok: false, error: "Add a video (upload media) before publishing — Reels/TikTok/Shorts need a video file." }, 409);
    }

    const pairs = await resolveIntegrations(platforms);
    if (!pairs.length) {
      return json({ ok: false, error: "No connected Postiz channel matches this post's platforms. Connect the accounts in Postiz and set POSTIZ_INTEGRATIONS." }, 409);
    }

    const text = [String((p as any).caption || ""), String((p as any).hashtags || "")].filter(Boolean).join("\n\n");
    const when = (p as any).scheduled_at ? new Date((p as any).scheduled_at) : null;
    const future = !!(when && when.getTime() > Date.now() + 60000);

    let imageArr: any[] = [];
    if ((p as any).media_url) {
      const media = await uploadMedia((p as any).media_url);
      imageArr = media ? [media] : [{ path: (p as any).media_url }];
    }

    const posts = pairs.map(({ platform, id, type }) => {
      const settings: any = { __type: type || NET[platform] || platform };
      if (platform === "youtube") { settings.title = String((p as any).title || "NMAO").slice(0, 95); }
      // Instagram (standalone) requires post_type: "post" (feed/Reel) or "story".
      if (platform === "instagram") { settings.post_type = "post"; }
      return { integration: { id }, value: [{ content: text, image: imageArr }], settings };
    });
    // Postiz requires a date even for immediate posts.
    const payload: any = { type: future ? "schedule" : "now", shortLink: false, tags: [], posts };
    payload.date = future ? when!.toISOString() : new Date(Date.now() + 60000).toISOString();

    const res = await pfetch("/api/public/v1/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      const msg = (out?.message) || (Array.isArray(out?.errors) && out.errors[0]?.message) || ("Postiz " + res.status);
      await svc.from("social_posts").update({ status: "failed", publish_error: String(msg).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", postId);
      return json({ ok: false, status: "failed", error: String(msg).slice(0, 300) });
    }

    const postizId = String(
      out?.id ||
      (Array.isArray(out) && out[0]?.id) ||
      (Array.isArray(out?.posts) && out.posts[0]?.id) ||
      "",
    ).slice(0, 200) || null;

    const newStatus = future ? "scheduled" : "posted";
    await svc.from("social_posts").update({
      status: newStatus,
      postiz_id: postizId,
      posted_at: future ? null : new Date().toISOString(),
      publish_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);

    return json({ ok: true, status: newStatus, postiz_id: postizId });
  } catch (e: any) {
    console.error("social-publish:", e?.message || e);
    return json({ ok: false, error: "Publish error. Please try again." }, 500);
  }
});
