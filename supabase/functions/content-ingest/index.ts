// =====================================================================
// EDGE FUNCTION: content-ingest  (Content Drop)
// A school owner (or staff) drops a raw photo/clip; this turns it into an
// on-brand pending draft in the social queue. When ANTHROPIC_API_KEY is set it
// runs Claude vision on a keyframe to write the caption/hashtags/pillar and
// detect people/minors; otherwise it falls back to a template. Safety-first:
// if vision can't confirm there are NO people, needs_consent = true.
//
// The full file is expected already uploaded to the public social-media bucket
// (path passed in). media_url points at its public URL.
//
// Auth: the school's owner (schools.auth_user_id) OR staff with the Social role.
// Env: ANTHROPIC_API_KEY? (enables vision), GEN_MODEL? (default claude-sonnet-5).
// POST { school_id, path, media_type:'image'|'video', frame_b64?, frame_mime? }
//   -> { ok, post_id, source:'vision'|'template' }
// DEPLOY: name = content-ingest, Verify JWT OFF (does its own auth).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const AI_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const MODEL = Deno.env.get("GEN_MODEL") || "claude-sonnet-5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const PILLARS = ["Student Wins", "Technique", "Values & Wisdom", "School Spotlight", "Tournament"];

async function vision(frameB64: string, frameMime: string, school: string): Promise<any | null> {
  try {
    const prompt = `You are the social voice of the National Martial Arts Organization (NMAO): values over virality — integrity, discipline, growth; "Continue the path." This image is content from the martial arts school "${school}", to be posted on NMAO's channels to promote that school to prospective students.
Return ONLY minified JSON with keys:
"caption" (1-3 sentences, on-brand, promotes ${school}, no hashtags, no emojis, never invent facts you can't see),
"hashtags" (6-8 space-separated #tags, lowercase, martial-arts relevant, end with #nmao),
"pillar" (one of: ${PILLARS.join(", ")}),
"has_people" (true if any human is visible),
"has_minor" (true if anyone visible appears under 18).`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 700,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: frameMime || "image/jpeg", data: frameB64 } },
          { type: "text", text: prompt },
        ] }],
      }),
    });
    if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 300)); return null; }
    const j = await r.json();
    const txt = (j?.content?.[0]?.text || "").trim();
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (e) { console.error("vision error", (e as any)?.message || e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const auth = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await auth.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid session." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const schoolRef = String(body.school_id || body.school || "").trim();
    const path = String(body.path || "").trim().replace(/^\/+/, "");
    const mediaType = body.media_type === "image" ? "image" : "video";
    if (!schoolRef || !path) return json({ ok: false, error: "school and path are required." }, 400);

    // gate: school owner OR social staff. Resolve school by uuid or name.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(schoolRef);
    const { data: sch } = isUuid
      ? await svc.from("schools").select("id, name, auth_user_id").eq("id", schoolRef).maybeSingle()
      : await svc.from("schools").select("id, name, auth_user_id").ilike("name", schoolRef).limit(1).maybeSingle();
    if (!sch) return json({ ok: false, error: `No school matches "${schoolRef}".` }, 404);
    let allowed = (sch as any).auth_user_id === uid;
    if (!allowed) {
      const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
      if (staff) { const { data: cap } = await svc.rpc("staff_can_uid", { p_uid: uid, p_slice: "social", p_level: "full" }); allowed = !!cap; }
    }
    if (!allowed) return json({ ok: false, error: "Not authorized for this school." }, 403);

    const school = String((sch as any).name || "this school");
    const mediaUrl = `${URL_}/storage/v1/object/public/social-media/${path}`;

    // caption: vision when possible, else template
    let source: "vision" | "template" = "template";
    let caption = `New from ${school}. Discipline, focus, growth — this is the standard. Continue the path.`;
    let hashtags = "#martialarts #dojo #discipline #karate #taekwondo #community #nmao";
    let pillar = "School Spotlight";
    let needsConsent = true; // safe default until vision confirms otherwise

    if (AI_KEY && body.frame_b64) {
      const v = await vision(String(body.frame_b64), String(body.frame_mime || "image/jpeg"), school);
      if (v && v.caption) {
        source = "vision";
        caption = String(v.caption).slice(0, 600);
        if (v.hashtags) hashtags = String(v.hashtags).slice(0, 300);
        if (PILLARS.includes(v.pillar)) pillar = v.pillar;
        needsConsent = (v.has_people !== false) || v.has_minor === true; // people or unknown -> consent
      }
    }

    // dedup: same dropped file -> same draft
    const { data: dup } = await svc.from("social_posts").select("id").eq("source_event", "drop:" + path).maybeSingle();
    if (dup) return json({ ok: true, code: "exists", post_id: (dup as any).id, source });

    const isImage = mediaType === "image";
    const { data: post, error } = await svc.from("social_posts").insert({
      sort_order: 0, pillar, title: `Drop: ${school}`,
      format: isImage ? "Post" : "Reel",
      platforms: isImage ? ["Instagram"] : ["Instagram", "TikTok", "YouTube"],
      hook: "Straight from the mat.",
      caption, hashtags,
      media_note: `Content Drop from ${school}. ${source === "template" ? "Auto-caption (template — set ANTHROPIC_API_KEY for AI vision). " : ""}Confirm the signed media release (parent/guardian for a minor) before publishing.`,
      cta_url: "https://directory.nmao.us/?utm_source=social&utm_medium=organic&utm_campaign=drop",
      media_url: mediaUrl,
      needs_consent: needsConsent,
      status: "pending",
      source_event: "drop:" + path,
    }).select("id").single();
    if (error) {
      if (String(error.code) === "23505") return json({ ok: true, code: "exists", post_id: null }); // dedup by source_event
      return json({ ok: false, error: error.message }, 200);
    }
    return json({ ok: true, post_id: (post as any).id, source });
  } catch (e: any) {
    console.error("content-ingest:", e?.message || e);
    return json({ ok: false, error: "Ingest failed. Please try again." }, 500);
  }
});
