// ============================================================
// EDGE FUNCTION: entry-upload-reminders
// Reminds competitors to upload their MONTHLY tournament entry video before the
// round closes. Fires at three escalating windows before rounds.closes_at:
// T-7d, T-2d, T-2h. Email (Resend) + in-app (notifications, pref-gated).
// Deduped per (entry, window) via the notifications table itself.
//
// Only reminds PAID entries with no video (status='submitted', payment_status='paid').
// Mirrors the proven nmao.duel_reminders() pattern, but for `entries`.
//
// TRIGGER: pg_cron `entry-upload-reminders` hourly (x-cron-secret = UPLOAD_CRON_SECRET).
// JWT: OFF (internal cron). Deploy: --no-verify-jwt
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = "https://apps.apple.com/app/id6812842694"; // NMAO Compete
const ACCENT = "#C9A84C";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function pretty(evt: string) { return evt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function fmtET(iso: string) {
  try { return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"; }
  catch { return "soon"; }
}
function windowFor(hoursUntil: number): string | null {
  if (hoursUntil <= 2) return "2h";
  if (hoursUntil <= 48) return "2d";
  if (hoursUntil <= 168) return "7d";
  return null;
}
function windowLabel(w: string) { return w === "2h" ? "in about 2 hours" : w === "2d" ? "in 2 days" : "in 7 days"; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.headers.get("x-cron-secret") !== Deno.env.get("UPLOAD_CRON_SECRET")) return json({ ok: false, error: "unauthorized" }, 401);
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  let sent = 0, emailed = 0, skipped = 0;
  try {
    // Event code -> friendly label (Traditional Forms, Open Weapons, …); falls back to a
    // prettied code for any event not yet in event_types.
    const { data: ets } = await svc.from("event_types").select("code, name");
    const evtName = (code: string) => (ets || []).find((t: any) => t.code === code)?.name || pretty(code);

    // Candidate entries: real (non-demo) open round, no video, PAID, no video submitted yet,
    // closing within the widest reminder window (7 days).
    const { data: rows, error } = await svc
      .from("entries")
      .select("id, event, competitor_id, video_url, status, payment_status, rounds!inner(seq, state, closes_at), competitors!inner(email, first_name)")
      .is("video_url", null)
      .eq("status", "submitted")
      .eq("payment_status", "paid");
    if (error) return json({ ok: false, error: error.message }, 500);

    const now = Date.now();
    for (const e of (rows || []) as any[]) {
      const r = Array.isArray(e.rounds) ? e.rounds[0] : e.rounds;
      const c = Array.isArray(e.competitors) ? e.competitors[0] : e.competitors;
      if (!r || !r.closes_at) continue;
      if (!["open", "collecting"].includes(r.state)) continue;
      if ((r.seq ?? 0) >= 900) continue; // demo/test rounds
      const hoursUntil = (new Date(r.closes_at).getTime() - now) / 3600000;
      if (hoursUntil <= 0) continue;
      const win = windowFor(hoursUntil);
      if (!win) continue;

      // Dedup: already reminded for this entry+window?
      const { data: dup } = await svc.from("notifications").select("id")
        .eq("competitor_id", e.competitor_id).eq("type", "upload_reminder")
        .eq("data->>entry_id", e.id).eq("data->>window", win).limit(1);
      if (dup && dup.length) { skipped++; continue; }

      // Respect opt-out (same gate nmao.notify uses).
      const { data: pref } = await svc.from("notification_prefs").select("enabled")
        .eq("competitor_id", e.competitor_id).eq("type", "upload_reminder").maybeSingle();
      if (pref && pref.enabled === false) { skipped++; continue; }

      const evt = evtName(e.event);
      const closesTxt = fmtET(r.closes_at);
      // In-app
      await svc.from("notifications").insert({
        competitor_id: e.competitor_id, type: "upload_reminder",
        title: "Upload reminder ⏰",
        body: `Your ${evt} entry closes ${windowLabel(win)} (${closesTxt}). Upload your video before then!`,
        data: { entry_id: e.id, window: win, event: e.event },
      });
      sent++;

      // Email
      const email = (c?.email || "").trim();
      if (email && RESEND_API_KEY) {
        const name = esc(c?.first_name || "there");
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#0b0b0d;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#f5f0e8">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141416;border:1px solid #26262b">
<tr><td style="padding:28px 32px 6px 32px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#C9A84C;letter-spacing:.08em">National Martial Arts Org.</div><div style="margin-top:7px"><span style="display:inline-block;background:#7c3aed;background:linear-gradient(90deg,#2563eb 0%,#7c3aed 52%,#dc2626 100%);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:5px 12px;border-radius:5px">Tournament League</span></div></td></tr>
<tr><td style="padding:8px 32px 4px 32px"><h1 style="margin:0;font-size:20px;font-weight:600">Upload your video ⏰</h1></td></tr>
<tr><td style="padding:8px 32px 4px 32px;font-size:15px;line-height:1.6;color:#d7d2c8">Hi ${name}, your <strong>${esc(evt)}</strong> entry closes <strong>${windowLabel(win)}</strong> — ${esc(closesTxt)}. Open the NMAO Compete app and upload your video before the deadline so it can be judged.</td></tr>
<tr><td style="padding:4px 32px 24px 32px;font-size:13px;line-height:1.6;color:#9a958c">Miss the deadline and your entry is credited toward a future tournament — but don't miss your shot at this month's medals.</td></tr>
<tr><td align="center" style="padding:0 32px 28px 32px"><a href="${APP_URL}" style="display:inline-block;background:#7c3aed;background:linear-gradient(90deg,#2563eb 0%,#7c3aed 52%,#dc2626 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:6px">Open NMAO Compete</a></td></tr>
</table></td></tr></table></body></html>`;
        const rr = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "NMAO Compete <support@nmao.us>", to: email, subject: `⏰ Upload your ${evt} video — closes ${closesTxt}`, html }),
        });
        if (rr.ok) emailed++;
      }
    }
    return json({ ok: true, in_app: sent, emailed, skipped });
  } catch (err) {
    console.error("entry-upload-reminders error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
