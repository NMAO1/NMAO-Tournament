// =====================================================================
// EDGE FUNCTION: brand-video
// Burns the NMAO border + lower-third onto a post's video via the overlay
// worker on the Postiz VPS, then points the post's media_url at the branded
// clip. Keeps the pre-brand source in media_original so re-branding never
// double-brands. Staff-gated (Social role).
//
// Env: OVERLAY_URL (e.g. https://postiz.nmao.us/nmao-overlay), OVERLAY_SECRET.
// POST { post_id } -> { ok, url } | { ok:false, error }
// DEPLOY: name = brand-video, Verify JWT OFF (does its own auth).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const OVERLAY_URL = (Deno.env.get("OVERLAY_URL") || "").replace(/\/+$/, "");
const OVERLAY_SECRET = Deno.env.get("OVERLAY_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

// Sign a private entry-videos path; pass through full URLs.
async function resolveMedia(val: string): Promise<string | null> {
  if (/^https?:\/\//i.test(val)) return val;
  const path = val.replace(/^\/+/, "").replace(/^entry-videos\//, "");
  const { data, error } = await svc.storage.from("entry-videos").createSignedUrl(path, 3600);
  if (error) { console.error("resolveMedia:", (error as any)?.message || error); return null; }
  return data?.signedUrl ?? null;
}

// Derive lower-third fields from the post (Student Spotlight on_screen convention,
// else the school from the title).
function overlayFields(p: any): { name: string; place: string; event: string; school: string } {
  const parts = String(p.on_screen || "").split("->").map((s: string) => s.trim()).filter(Boolean);
  if (parts.length >= 2 && /place/i.test(parts[1])) {
    const seg = parts[1].split(",");
    return { name: parts[0] || "", place: (seg[0] || "").trim(), event: seg.slice(1).join(",").trim(), school: parts[2] || "" };
  }
  const school = String(p.title || "").replace(/^(Featured|Spotlight):\s*/i, "").split(" — ")[0].trim();
  return { name: "", place: "", event: "", school };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const auth = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await auth.auth.getUser();
  if (!u?.user?.id) return json({ ok: false, error: "Invalid session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
  if (!staff) return json({ ok: false, error: "Staff only." }, 403);
  const { data: cap } = await svc.rpc("staff_can_uid", { p_uid: u.user.id, p_slice: "social", p_level: "full" });
  if (!cap) return json({ ok: false, error: "Not authorized — requires the Social role." }, 403);

  if (!OVERLAY_URL || !OVERLAY_SECRET) {
    return json({ ok: false, code: "not_configured", error: "Branding isn't connected yet (OVERLAY_URL / OVERLAY_SECRET)." }, 200);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const postId = String(body.post_id || "").trim();
    if (!postId) return json({ ok: false, error: "post_id required." }, 400);

    const { data: p } = await svc.from("social_posts").select("*").eq("id", postId).maybeSingle();
    if (!p) return json({ ok: false, error: "Post not found." }, 404);

    const src = String((p as any).media_original || (p as any).media_url || "");
    if (!src) return json({ ok: false, error: "This post has no video to brand yet — add one first." }, 409);

    const signed = await resolveMedia(src);
    if (!signed) return json({ ok: false, error: "Couldn't access the source video (private storage)." }, 409);

    const f = overlayFields(p);
    const res = await fetch(OVERLAY_URL + "/render", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-overlay-secret": OVERLAY_SECRET },
      body: JSON.stringify({ input_url: signed, out_path: `branded/${postId}.mp4`, ...f }),
    });
    const out = await res.json().catch(() => ({} as any));
    if (!res.ok || !out?.ok || !out?.url) {
      return json({ ok: false, error: String(out?.error || ("overlay " + res.status)).slice(0, 300) }, 200);
    }

    // cache-bust so the swapped media is re-fetched
    const finalUrl = out.url + "?v=" + Date.now();
    await svc.from("social_posts").update({
      media_original: (p as any).media_original || src,
      media_url: finalUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);

    return json({ ok: true, url: finalUrl });
  } catch (e: any) {
    console.error("brand-video:", e?.message || e);
    return json({ ok: false, error: "Branding failed. Please try again." }, 500);
  }
});
