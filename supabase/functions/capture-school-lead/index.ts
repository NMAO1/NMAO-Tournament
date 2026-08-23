// =====================================================================
// EDGE FUNCTION: capture-school-lead
// Public, unauthenticated endpoint for the join.nmao.us landing-page form.
// Stores an inbound school-interest lead (service role -> bypasses RLS) and,
// best-effort, emails a notification to the owner. The lead is ALWAYS stored
// even if the email step fails, so nothing is lost.
//
// DEPLOY: name = capture-school-lead, **Verify JWT OFF** (public form, no auth).
//   supabase functions deploy capture-school-lead --no-verify-jwt --project-ref oxzuavpyoetchwebdejp
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//      RESEND_API_KEY (optional), EMAIL_FROM (optional),
//      LEADS_NOTIFY_EMAIL (optional; defaults to support@nmao.us).
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
const NOTIFY = Deno.env.get("LEADS_NOTIFY_EMAIL") || "support@nmao.us";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const body = (await req.json().catch(() => null)) as any;
  if (!body || typeof body !== "object") return json({ ok: false, error: "Bad body" }, 400);

  // Honeypot: real users never fill this hidden field. Bots do -> pretend success.
  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true });

  const school_name = clip(String(body.school_name ?? "").trim(), 200);
  const email = clip(String(body.email ?? "").trim(), 200);
  const phone = clip(String(body.phone ?? "").trim(), 60) || null;
  // Attribution: allow a known set of sources; anything else falls back to the school page.
  const SOURCES = new Set(["join.nmao.us", "compete-nomination"]);
  const source = SOURCES.has(String(body.source ?? "")) ? String(body.source) : "join.nmao.us";

  if (!school_name) return json({ ok: false, error: "School name is required." }, 400);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "A valid email is required." }, 400);

  const user_agent = clip(req.headers.get("user-agent") || "", 400) || null;

  const sb = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const { error } = await sb
    .from("school_leads")
    .insert({ school_name, email, phone, source, user_agent });

  if (error) {
    console.error("school_leads insert failed", error.message);
    return json({ ok: false, error: "Could not save. Please try again or call us." }, 500);
  }

  // Best-effort notification — never blocks the successful lead capture.
  if (RESEND) {
    try {
      const html =
        `<h2>New school lead — join.nmao.us</h2>` +
        `<p><b>School:</b> ${esc(school_name)}</p>` +
        `<p><b>Email:</b> ${esc(email)}</p>` +
        (phone ? `<p><b>Phone:</b> ${esc(phone)}</p>` : "");
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: NOTIFY, reply_to: email, subject: `New school lead: ${school_name}`, html }),
      });
      if (!r.ok) console.error("lead notify email failed", r.status, await r.text().catch(() => ""));
    } catch (e) {
      console.error("lead notify email threw", (e as Error).message);
    }
  }

  return json({ ok: true });
});
