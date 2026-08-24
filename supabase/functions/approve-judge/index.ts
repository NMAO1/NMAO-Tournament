// =====================================================================
// EDGE FUNCTION: approve-judge  (Staff — approve an application + invite)
// A pending judge application, once reviewed, is approved here: sets the pay
// rate + (optional) school affiliation, creates the judge's auth account, and
// generates a password SETUP link (Supabase recovery) to email them. The judge
// then completes bg consent + IC agreement + creed + payouts in-app; they reach
// status='active' only when all of those are satisfied.
//
// AUTH: service-role key (internal) OR a signed-in NMAO staff member.
// POST { judge_id, hourly_rate_cents?, school_id?, redirect_to? }
//   -> { ok, judge_status, setup_link }
// Deploy: name = approve-judge, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE = (Deno.env.get("SITE_URL") || "https://example.com").replace(/\/$/, "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function authorizeStaff(bearer: string, svc: any): Promise<boolean> {
  if (bearer && bearer === SERVICE) return true;
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return false;
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  return !!staff;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  if (!(await authorizeStaff(bearer, svc))) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);

  try {
    const b = await req.json().catch(() => ({}));
    const judgeId = String(b.judge_id || "").trim();
    if (!judgeId) return json({ ok: false, error: "judge_id is required." }, 400);
    // Where the recovery link lands to set a password. Ignore localhost / example
    // (dev origins Mission Control may pass) and always use the real judge portal.
    const JUDGE = (Deno.env.get("JUDGE_URL") || "https://judge.nmao.us").replace(/\/$/, "");
    let redirectTo = String(b.redirect_to || "").trim();
    if (!redirectTo || /localhost|127\.0\.0\.1|example\.com/i.test(redirectTo)) redirectTo = `${JUDGE}/judge/set-password`;

    const { data: judge } = await svc.from("judges").select("id, email, status, auth_user_id").eq("id", judgeId).maybeSingle();
    if (!judge) return json({ ok: false, error: "Judge not found." }, 404);

    // Decline an application — no account, no invite.
    if (String(b.action || "") === "reject") {
      await svc.from("judges").update({ status: "rejected" }).eq("id", judgeId);
      return json({ ok: true, judge_status: "rejected" });
    }

    // Mark the background check cleared (staff/interim, until a screening provider
    // is wired). Activates the judge if everything else is already satisfied.
    if (String(b.action || "") === "clear_bg") {
      await svc.from("judges").update({ background_check_status: "cleared" }).eq("id", judgeId);
      const { data: j } = await svc.from("judges").select("status, background_check_status, ic_agreement_accepted_at, creed_accepted_at, payouts_enabled").eq("id", judgeId).single();
      const jj = j as any;
      const ready = jj && jj.status !== "rejected" && jj.background_check_status === "cleared" && !!jj.ic_agreement_accepted_at && !!jj.creed_accepted_at && !!jj.payouts_enabled;
      if (ready && jj.status !== "active") { await svc.from("judges").update({ status: "active" }).eq("id", judgeId); return json({ ok: true, judge_status: "active" }); }
      return json({ ok: true, judge_status: jj?.status ?? "unknown" });
    }

    const email = (judge as any).email as string;
    if (!email) return json({ ok: false, error: "This judge has no email on file." }, 400);

    // Approve: set rate/school, mark approved + certified.
    const upd: Record<string, unknown> = { status: "approved", certified_at: new Date().toISOString() };
    if (Number.isFinite(Number(b.hourly_rate_cents))) upd.hourly_rate_cents = Math.max(0, Math.floor(Number(b.hourly_rate_cents)));
    if (b.school_id) upd.school_id = String(b.school_id);
    await svc.from("judges").update(upd).eq("id", judgeId);

    // Ensure an auth account exists.
    let authUserId = (judge as any).auth_user_id as string | null;
    if (!authUserId) {
      const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { role: "judge" } });
      if (created?.user) authUserId = created.user.id; // if it already existed, generateLink below still resolves the user
    }

    // Generate the password SETUP link (recovery). Supabase will also email it if SMTP is configured.
    const { data: linkData, error: lErr } = await svc.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (lErr) { console.error("generateLink:", lErr); return json({ ok: false, error: "Could not generate the setup link." }, 500); }
    if (!authUserId && (linkData as any)?.user?.id) authUserId = (linkData as any).user.id;
    if (authUserId && authUserId !== (judge as any).auth_user_id) await svc.from("judges").update({ auth_user_id: authUserId }).eq("id", judgeId);

    // Prefer a scanner-safe link straight to the set-password page carrying the
    // token_hash (the page verifies it in JS — email scanners can't burn it).
    // Fall back to the raw action_link if the hash isn't available.
    const hashed = (linkData as any)?.properties?.hashed_token as string | undefined;
    const link = hashed
      ? `${JUDGE}/judge/set-password?token_hash=${encodeURIComponent(hashed)}&type=recovery`
      : ((linkData as any)?.properties?.action_link ?? null);

    // Auto-email the setup link to the judge (best-effort; MC still shows it as a fallback).
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const FROM = Deno.env.get("EMAIL_FROM") || "NMAO Tournament <noreply@nmao.us>";
    let emailed = false;
    if (RESEND && link) {
      try {
        const first = String((judge as any).first_name || "there").replace(/[<>&]/g, "");
        const html =
          `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#222">` +
          `<h2 style="margin:0 0 10px">Welcome to NMAO judging</h2>` +
          `<p>Hi ${first}, your judge application has been <b>approved</b>.</p>` +
          `<p>Set your password to activate your account and start scoring:</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#C89B3C;color:#141210;font-weight:bold;text-decoration:none;padding:12px 24px;border-radius:10px">Set your password</a></p>` +
          `<p style="color:#888;font-size:12px">Or paste this into your browser:<br>${link}</p>` +
          `<p style="color:#888;font-size:12px">This link is single-use and expires soon. If it lapses, ask NMAO to resend it.</p></div>`;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: email, subject: "Your NMAO judge account — set your password", html }),
        });
        emailed = r.ok;
        if (!r.ok) console.error("approve-judge email failed", r.status, await r.text().catch(() => ""));
      } catch (ee: any) { console.error("approve-judge email threw", ee?.message || ee); }
    }

    return json({ ok: true, judge_status: "approved", setup_link: link, emailed });
  } catch (e: any) {
    console.error("approve-judge error:", e?.message || e);
    return json({ ok: false, error: e?.message || "server_error" }, 500);
  }
});
