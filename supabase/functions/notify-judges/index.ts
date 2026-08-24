// =====================================================================
// EDGE FUNCTION: notify-judges  (Staff — email judges there's work / reminders)
// Sends email via Resend (reuses the membership account's key + verified domain).
//   kind='new_pods'  -> tell active+cleared judges a round has videos to judge
//   kind='heads_up'  -> advance notice: judging opens in ~{hours_until}h (get ready)
//   kind='deadline'  -> remind judges holding UNSUBMITTED claimed pods (near close)
// Judge app is web, so email is the channel. Idempotent-ish: caller decides when.
//
// AUTH: Verify JWT = OFF (self-guarded). Caller must be NMAO staff (JWT),
//       the service role, OR present a matching x-cron-secret (for pg_cron).
// Env: RESEND_API_KEY, EMAIL_FROM (e.g. "NMAO Tournament <judges@mail.nmao.us>"),
//      JUDGE_URL (default https://judge.nmao.us), CRON_SECRET (cron auth).
// POST { kind?, round_id?, hours_until? } -> { ok, sent, failed, skipped, kind }
// Deploy: name = notify-judges, **Verify JWT OFF** (deploy --no-verify-jwt).
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
const JUDGE_URL = (Deno.env.get("JUDGE_URL") || "https://judge.nmao.us").replace(/\/$/, "");
const CRON = Deno.env.get("CRON_SECRET");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!r.ok) { console.error("resend send failed", to, r.status, await r.text().catch(() => "")); return false; }
  return true;
}

const shell = (heading: string, body: string, cta: string) => `
  <div style="background:#0b0b0d;padding:32px 0;font-family:Helvetica,Arial,sans-serif">
    <div style="max-width:460px;margin:0 auto;background:#161619;border:1px solid #26262b;border-radius:16px;padding:28px 26px;color:#ececec">
      <div style="height:4px;width:120px;border-radius:99px;background:linear-gradient(100deg,#FF2E3B,#C22DE0,#A32BF7,#3F6BFF);margin-bottom:18px"></div>
      <h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px">${heading}</h1>
      <p style="color:#c8c8cf;font-size:15px;line-height:1.6;margin:0 0 22px">${body}</p>
      <a href="${JUDGE_URL}" style="display:inline-block;background:linear-gradient(160deg,#E9C15A,#C9922E);color:#141210;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:11px;font-size:15px">${cta}</a>
      <p style="color:#66666e;font-size:12px;margin:20px 0 0">NMAO Tournament · You're receiving this as an active NMAO judge.</p>
    </div>
  </div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!RESEND) return json({ ok: false, error: "Email not configured (RESEND_API_KEY missing)." }, 500);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const cronHdr = req.headers.get("x-cron-secret") || "";
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  // pg_cron (x-cron-secret), service-role, or a signed-in staff user.
  let ok = (!!CRON && cronHdr === CRON) || (!!bearer && bearer === SERVICE);
  if (!ok) {
    if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
    const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
    const { data: u } = await authClient.auth.getUser();
    if (!u?.user?.id) return json({ ok: false, error: "Invalid or expired session." }, 401);
    const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", u.user.id).maybeSingle();
    ok = !!staff;
  }
  if (!ok) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind || "new_pods");
    let sent = 0, failed = 0, skipped = 0;

    if (kind === "new_pods") {
      // Every active, background-cleared judge with an email.
      const { data: judges } = await svc.from("judges")
        .select("id, first_name, email")
        .eq("status", "active").eq("background_check_status", "cleared").not("email", "is", null);
      for (const j of (judges ?? []) as any[]) {
        if (!j.email) { skipped++; continue; }
        const html = shell(
          `New videos to judge, ${j.first_name || "Judge"}`,
          "A new round is open for judging. Log in to claim a pod and start scoring — you're paid per video you complete.",
          "Open the judging queue →",
        );
        (await sendEmail(j.email, "New videos to judge — NMAO Tournament", html)) ? sent++ : failed++;
      }
    } else if (kind === "heads_up") {
      // Advance notice — judging opens in ~N hours. Same audience as new_pods.
      const hrs = Math.max(1, Math.round(Number(body.hours_until) || 24));
      const whenPhrase = hrs >= 20 && hrs <= 30 ? "tomorrow" : `in about ${hrs} hours`;
      const { data: judges } = await svc.from("judges")
        .select("id, first_name, email")
        .eq("status", "active").eq("background_check_status", "cleared").not("email", "is", null);
      for (const j of (judges ?? []) as any[]) {
        if (!j.email) { skipped++; continue; }
        const html = shell(
          `Judging opens ${whenPhrase}, ${j.first_name || "Judge"}`,
          `Submissions have closed and judging opens ${whenPhrase} — pods will be available to claim and score. Log in and be ready; you're paid per video you complete.`,
          "Get ready →",
        );
        (await sendEmail(j.email, `Judging opens ${whenPhrase} — NMAO Tournament`, html)) ? sent++ : failed++;
      }
    } else if (kind === "deadline") {
      // Judges holding claimed-but-unsubmitted assignments (nudge before close).
      const { data: rows } = await svc.from("judge_assignments")
        .select("judge_id, judges!inner(first_name, email, status)")
        .neq("state", "submitted").eq("judges.status", "active");
      const seen = new Set<string>();
      for (const r of (rows ?? []) as any[]) {
        const j = r.judges; const email = j?.email;
        if (!email || seen.has(email)) { if (email) skipped++; continue; }
        seen.add(email);
        const html = shell(
          `You have videos still to score, ${j.first_name || "Judge"}`,
          "You've claimed pods that aren't finished yet. Please submit your scores before the judging window closes so competitors get their results on time.",
          "Finish scoring →",
        );
        (await sendEmail(email, "Reminder: finish your judging — NMAO Tournament", html)) ? sent++ : failed++;
      }
    } else {
      return json({ ok: false, error: `Unknown kind: ${kind}` }, 400);
    }

    return json({ ok: true, kind, sent, failed, skipped });
  } catch (e: any) {
    console.error("notify-judges error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
