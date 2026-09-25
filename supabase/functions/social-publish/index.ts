// =====================================================================
// EDGE FUNCTION: social-publish
// Sends ONE approved social post to the connected accounts via Ayrshare
// (Instagram Reels / TikTok / YouTube Shorts). Called from mc.nmao.us/social.html
// ("Send to platform"). Staff-gated (or cron-gated for future automation).
//
// Requires the AYRSHARE_API_KEY secret. Until it is set, this returns a clear
// "not connected" message and changes nothing — so the rest of the queue
// (generate / approve / schedule / upload media) works without it.
//
// A post is publishable only when it is approved/scheduled AND has media_url.
// If scheduled_at is in the future we hand Ayrshare a scheduleDate (it posts at
// that time -> status 'scheduled'); otherwise it posts now -> status 'posted'.
//
// DEPLOY: name = social-publish, Verify JWT OFF (does its own auth).
// POST { post_id } -> { ok, status, ayrshare_id?, error? }
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

// our platform labels -> Ayrshare network names
const NET: Record<string, string> = { instagram: "instagram", tiktok: "tiktok", youtube: "youtube" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // gate: cron secret OR signed-in staff
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

  if (!AYRSHARE_KEY) {
    return json({ ok: false, code: "not_configured", error: "Publishing isn't connected yet — add the AYRSHARE_API_KEY secret to go live." }, 200);
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
    if (!(p as any).media_url) {
      return json({ ok: false, error: "Add a video (upload media) before publishing — Reels/TikTok/Shorts need a video file." }, 409);
    }
    if ((p as any).needs_consent && !(p as any).consent_confirmed) {
      return json({ ok: false, code: "consent_required", error: "This post shows a real student — confirm the signed media release is on file before publishing." }, 409);
    }

    const platforms = ((p as any).platforms || [])
      .map((x: string) => NET[String(x).toLowerCase()]).filter(Boolean);
    if (platforms.length === 0) return json({ ok: false, error: "No supported platforms on this post." }, 409);

    const text = [String((p as any).caption || ""), String((p as any).hashtags || "")].filter(Boolean).join("\n\n");
    const when = (p as any).scheduled_at ? new Date((p as any).scheduled_at) : null;
    const future = when && when.getTime() > Date.now() + 60000;

    const payload: any = {
      post: text,
      platforms,
      mediaUrls: [(p as any).media_url],
    };
    if (future) payload.scheduleDate = when!.toISOString();
    if (platforms.includes("youtube")) {
      payload.youTubeOptions = { title: String((p as any).title || "NMAO").slice(0, 95), visibility: "public" };
    }

    const res = await fetch("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: { "Authorization": "Bearer " + AYRSHARE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));

    // Ayrshare returns { status: 'success'|'error', id, postIds: [...] , errors?: [...] }
    const ok = res.ok && (out?.status === "success" || Array.isArray(out?.postIds));
    if (!ok) {
      const msg = (out?.errors && out.errors[0] && (out.errors[0].message || out.errors[0].action)) || out?.message || ("Ayrshare " + res.status);
      await svc.from("social_posts").update({ status: "failed", publish_error: String(msg).slice(0, 500), updated_at: new Date().toISOString() }).eq("id", postId);
      return json({ ok: false, status: "failed", error: String(msg).slice(0, 300) });
    }

    const newStatus = future ? "scheduled" : "posted";
    await svc.from("social_posts").update({
      status: newStatus,
      ayrshare_id: String(out?.id || (out?.postIds && out.postIds[0]?.id) || "").slice(0, 200) || null,
      posted_at: future ? null : new Date().toISOString(),
      publish_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);

    return json({ ok: true, status: newStatus, ayrshare_id: out?.id || null });
  } catch (e: any) {
    console.error("social-publish:", e?.message || e);
    return json({ ok: false, error: "Publish error. Please try again." }, 500);
  }
});
