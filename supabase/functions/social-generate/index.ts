// =====================================================================
// EDGE FUNCTION: social-generate
// Refills the Mission Control social queue with fresh, on-brand DRAFTS
// (status 'pending'). Staff-gated (called from mc.nmao.us/social.html) or
// cron-gated (x-cron-secret) for weekly auto-fill.
//
// Two engines, auto-selected:
//   - ANTHROPIC_API_KEY set  -> Claude writes fresh posts (GEN_MODEL, default
//     claude-sonnet-5; override via the GEN_MODEL secret if your key needs a
//     different id).
//   - no key                 -> template-remix from an on-brand bank (works
//     with zero setup; drafts are refined by staff before approval).
//
// Every draft lands as 'pending' and is edited/approved by a human before it
// ever posts. Never auto-publishes.
//
// DEPLOY: name = social-generate, Verify JWT ON.
// POST { count?:number(1-8), pillars?:string[] } -> { ok, created, source, posts }
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const GEN_MODEL = Deno.env.get("GEN_MODEL") || "claude-sonnet-5";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const SIGNS = ["Continue the path.", "Earned, one piece, one effort at a time.", "Humble in victory, unbroken in defeat."];
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const shuffle = <T>(a: T[]): T[] => a.map((v) => [Math.random(), v] as [number, T]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);

// ── On-brand template bank (fallback engine) ────────────────────────────────
type Tmpl = { pillar: string; format: string; platforms: string[]; hooks: string[]; caps: string[]; media: string[]; tags: string; onscreen: string[]; shots: string[] };
const BANK: Tmpl[] = [
  { pillar: "Values", format: "Reel", platforms: ["Instagram", "TikTok", "YouTube"],
    hooks: ["The scoreboard forgets. The habits don't.", "Discipline is the shortcut.", "Nobody sees the reps. Everybody sees the result.", "Fall seven, rise eight."],
    caps: ["Trophies gather dust. Discipline compounds. {sign}", "You are defined not by victories or defeats, but by your dedication to improve — one rep at a time. {sign}", "The quiet work, done when no one is watching, is the work that lasts. {sign}"],
    media: ["A quiet training montage — slow, cinematic; let the text carry it.", "One student arriving early to an empty dojo; reps, sweat, focus."],
    tags: "#mindset #discipline #martialarts #karate #motivation #growth #nmao",
    onscreen: ["The habit -> The result -> {sign}", "Show up. Bow in. Grow."],
    shots: ["1. Empty dojo, one student arriving early (0-3s)\n2. Reps - the same drill, again (3-9s)\n3. Sweat, focus, no audience (9-12s)\n4. Bow out alone (12-15s)"] },
  { pillar: "Technique", format: "Short", platforms: ["TikTok", "YouTube"],
    hooks: ["One detail most people miss.", "Fix this in 15 seconds.", "Three checkpoints, cleaner form.", "Save this for practice."],
    caps: ["Small fix, big difference. Save this and drill it 10 reps a day this week — slow before fast. {sign}", "Control first, speed follows. Drill it slow until it's clean. {sign}"],
    media: ["Instructor demo, tight framing, on-screen checkpoints.", "Slow-mo demo with on-screen checkpoint labels."],
    tags: "#karatetraining #martialartstips #technique #kata #forms #taekwondo #nmao",
    onscreen: ["The mistake -> The fix -> Drill it this week.", "1. Set -> 2. Execute -> 3. Reset -> Slow before fast."],
    shots: ["1. Common mistake, slow (0-4s)\n2. On-screen X over it (4-5s)\n3. The fix, done right (5-11s)\n4. Side-by-side wrong vs right (11-14s)\n5. Point to camera: your turn (14-15s)"] },
  { pillar: "Tournament", format: "Reel", platforms: ["Instagram", "TikTok", "YouTube"],
    hooks: ["The reveal never gets old.", "Top 3 get plated. Everyone earns a piece.", "The results are in.", "Every round adds a piece."],
    caps: ["Every month, competitors find out where they placed — and earn the next piece of their medallion. Win or lose, the story keeps building. {sign}", "Podium earns a plated piece; everyone else earns a participation piece — because competing is already a win worth keeping. {sign}"],
    media: ["Monthly reveal screen-capture + a real reaction clip (consented).", "The medallion pieces (gold/silver/bronze + participation) - vendor sample photos."],
    tags: "#tournament #martialarts #reveal #compete #karate #taekwondo #nmao",
    onscreen: ["Every month... -> The results are in. -> Add a piece to your story.", "Podium earns plated. -> Everyone earns a piece."],
    shots: ["1. The reveal starting to play (0-3s)\n2. A competitor watching, anticipation (3-6s)\n3. The placement lands (6-9s)\n4. Reaction (9-12s)\n5. A new segment added to their medallion (12-15s)"] },
  { pillar: "Student Wins", format: "Reel", platforms: ["Instagram", "TikTok"],
    hooks: ["She almost didn't step on the mat.", "White belt, day one.", "Two years of small efforts, stacked.", "Courage looks like showing up."],
    caps: ["Courage isn't the absence of fear — it's showing up anyway. Every competitor who steps on the mat has already won the hardest match. {sign}", "This is what the path looks like — one class, one rep, one round at a time. Every black belt was once a beginner who refused to quit. {sign}"],
    media: ["A real competitor entry clip (guardian consent / approved footage only).", "Before/after clips of one student (with consent) — ask accredited schools for then-and-now footage."],
    tags: "#martialartskids #confidence #youthsports #beltjourney #transformation #karate #nmao",
    onscreen: ["Almost didn't compete. -> Stepped up anyway. -> That's the win.", "White belt, day one. -> Today. -> This is the path."],
    shots: ["1. Nervous competitor on the sideline (0-3s)\n2. A breath, a nod - stepping forward (3-5s)\n3. The performance, full effort (5-11s)\n4. The finish - relief, a small smile (11-14s)\n5. Freeze on the smile (14-15s)"] },
  { pillar: "School Spotlight", format: "Reel", platforms: ["Instagram", "TikTok", "YouTube"],
    hooks: ["This school is NMAO-accredited.", "This dojo earned the seal.", "Meet an accredited school raising the standard."],
    caps: ["Meet [School Name] — an NMAO-accredited school raising the standard for how martial arts is taught. Accreditation means their integrity is independently verified, and we love shouting it out. Find accredited schools in the directory. Link in bio.", "[School Name] earned the NMAO seal — verified integrity, real teaching. This is what an accredited school looks like. Find them in the directory."],
    media: ["3-5 short vertical clips from the school + the NMAO seal graphic. Accredited schools only; rotate weekly."],
    tags: "#martialartsschool #accredited #dojo #karate #taekwondo #martialarts #nmao",
    onscreen: ["[School Name] -> Accredited by NMAO -> Verified integrity -> Find them in the directory."],
    shots: ["1. School exterior/interior, the NMAO seal on the wall (0-3s)\n2. A class in motion, focused (3-8s)\n3. A founder/instructor line to camera (8-12s)\n4. Students bowing out together (12-14s)\n5. End card: Accredited by NMAO + directory (14-15s)"] },
];

function fillSign(s: string): string { return s.replace(/\{sign\}/g, pick(SIGNS)); }
const NEEDS_CONSENT = new Set(["Student Wins", "Transformation", "School Spotlight"]);
function ctaFor(pillar: string): string {
  const u = "?utm_source=social&utm_medium=organic&utm_campaign=";
  if (pillar === "School Spotlight") return "https://directory.nmao.us/" + u + "spotlight";
  if (pillar === "Tournament") return "https://league.nmao.us/" + u + "tournament";
  if (pillar === "Brand") return "https://nmao.us/" + u + "brand";
  return "https://league.nmao.us/" + u + "compete";
}

function templateBatch(count: number, pillars: string[] | null, avoid: Set<string>): any[] {
  let pool = BANK.filter((t) => !pillars || pillars.length === 0 || pillars.includes(t.pillar));
  if (pool.length === 0) pool = BANK;
  const out: any[] = [];
  let guard = 0;
  const order = shuffle(pool);
  while (out.length < count && guard < count * 12) {
    guard++;
    const t = order[out.length % order.length] || pick(pool);
    const hook = pick(t.hooks);
    if (avoid.has(hook.toLowerCase())) continue;
    avoid.add(hook.toLowerCase());
    out.push({
      pillar: t.pillar, title: hook.replace(/[.?!]+$/, "").slice(0, 60), format: t.format, platforms: t.platforms,
      hook, caption: fillSign(pick(t.caps)), hashtags: t.tags,
      media_note: pick(t.media), on_screen: fillSign(pick(t.onscreen)), shot_list: pick(t.shots),
    });
  }
  return out;
}

// ── Claude engine ───────────────────────────────────────────────────────────
async function llmBatch(count: number, pillars: string[] | null, avoidHooks: string[]): Promise<any[]> {
  const system = `You are the NMAO social content generator. NMAO is a martial-arts organization built on integrity: accreditation, member software, and a tournament league. Voice: disciplined, warm, aspirational; VALUES OVER VIRALITY, never hype or trend-chasing. Values = integrity, discipline, growth; effort over outcome, path over place. Signature lines to rotate as endings: "Continue the path.", "Earned, one piece, one effort at a time.", "Humble in victory, unbroken in defeat.".
Pillars: Values, Technique, Tournament, Student Wins, Transformation, School Spotlight (only NMAO-accredited schools), Brand. Platforms are short vertical video (Instagram Reels, TikTok, YouTube Shorts), 15s, 9:16.
Return ONLY a JSON array, no prose, no markdown fences. Each element:
{"pillar","title"(<=60 chars),"format":"Reel"|"Short","platforms":["Instagram","TikTok","YouTube"],"hook"(on-screen 0-2s line),"caption"(2-3 sentences ending in a signature line),"hashtags"(space-separated, 6-8, incl #nmao),"media_note","on_screen"(beat arrows),"shot_list"(numbered lines with timecodes)}.
Any post using real student/competitor footage must note "with consent" in media_note. Do not invent school names — use [School Name].`;
  const user = `Generate ${count} NEW, distinct posts${pillars && pillars.length ? " across these pillars: " + pillars.join(", ") : " varied across pillars"}. Do NOT repeat these recent hooks: ${avoidHooks.slice(0, 30).map((h) => JSON.stringify(h)).join(", ") || "(none)"}. Return the JSON array only.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: GEN_MODEL, max_tokens: 3000, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error("anthropic " + res.status + ": " + (await res.text()).slice(0, 300));
  const data = await res.json();
  let text = (data?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = text.indexOf("["), j = text.lastIndexOf("]");
  if (i < 0 || j < 0) throw new Error("model did not return a JSON array");
  const arr = JSON.parse(text.slice(i, j + 1));
  return Array.isArray(arr) ? arr : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  // gate: a cron secret, OR a signed-in staff member
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
    if (!_cap) return json({ ok: false, error: "Not authorized — generating drafts requires the Social role." }, 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const count = Math.max(1, Math.min(8, Number(body.count) || 3));
    const pillars: string[] | null = Array.isArray(body.pillars) && body.pillars.length ? body.pillars.map(String) : null;

    // recent hooks to avoid repeating
    const { data: recent } = await svc.from("social_posts").select("hook, sort_order").order("created_at", { ascending: false }).limit(40);
    const avoidHooks = (recent || []).map((r: any) => String(r.hook || "")).filter(Boolean);
    const maxOrder = (recent || []).reduce((m: number, r: any) => Math.max(m, Number(r.sort_order) || 0), 0);

    let posts: any[] = [];
    let source = "template";
    if (ANTHROPIC_KEY) {
      try { posts = await llmBatch(count, pillars, avoidHooks); source = "claude"; }
      catch (e) { console.error("llm fallback:", (e as any)?.message || e); posts = []; }
    }
    if (posts.length === 0) { posts = templateBatch(count, pillars, new Set(avoidHooks.map((h) => h.toLowerCase()))); source = "template"; }
    if (posts.length === 0) return json({ ok: false, error: "Nothing generated." }, 500);

    const rows = posts.slice(0, count).map((p: any, k: number) => ({
      sort_order: maxOrder + 1 + k,
      pillar: String(p.pillar || "").slice(0, 40),
      title: String(p.title || "").slice(0, 120),
      format: String(p.format || "Reel").slice(0, 20),
      platforms: Array.isArray(p.platforms) ? p.platforms.map(String).slice(0, 4) : ["Instagram", "TikTok", "YouTube"],
      hook: String(p.hook || "").slice(0, 300),
      caption: String(p.caption || "").slice(0, 2200),
      hashtags: String(p.hashtags || "").slice(0, 500),
      media_note: String(p.media_note || "").slice(0, 500),
      on_screen: String(p.on_screen || "").slice(0, 500),
      shot_list: String(p.shot_list || "").slice(0, 1200),
      needs_consent: NEEDS_CONSENT.has(String(p.pillar || "")),
      cta_url: ctaFor(String(p.pillar || "")),
      status: "pending",
    }));
    const { data: inserted, error: iErr } = await svc.from("social_posts").insert(rows).select("id, title, pillar, status");
    if (iErr) { console.error("insert:", iErr); return json({ ok: false, error: "Could not save drafts." }, 500); }

    return json({ ok: true, created: (inserted || []).length, source, posts: inserted || [] });
  } catch (e: any) {
    console.error("social-generate:", e?.message || e);
    return json({ ok: false, error: "Generator error. Please try again." }, 500);
  }
});
