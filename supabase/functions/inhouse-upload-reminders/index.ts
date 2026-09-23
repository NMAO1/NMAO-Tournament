// ============================================================
// EDGE FUNCTION: inhouse-upload-reminders
// Reminds IN-HOUSE (school) tournament entrants to upload their video before the
// deadline — ONLY for format='video' tournaments. Email (Resend, to payer_email)
// + in-app (notifications, when the entrant is a linked competitor). Windows:
// T-7d, T-2d, T-2h before the deadline (upload_deadline if set, else the
// tournament's event_date at 23:59 ET). Deduped via ih_entrants.upload_reminders_sent.
//
// (No auto-credit/void here — in-house no-show money policy is a per-school
// decision, deferred. See memory inhouse-novideo-refund-policy.)
//
// TRIGGER: pg_cron `inhouse-upload-reminders` hourly (x-cron-secret). JWT: OFF.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ACCENT = "#C9A84C";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function fmtET(d: Date) {
  try { return d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET"; }
  catch { return "soon"; }
}
function windowFor(h: number): string | null { return h <= 2 ? "2h" : h <= 48 ? "2d" : h <= 168 ? "7d" : null; }
function windowLabel(w: string) { return w === "2h" ? "in about 2 hours" : w === "2d" ? "in 2 days" : "in 7 days"; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.headers.get("x-cron-secret") !== Deno.env.get("UPLOAD_CRON_SECRET")) return json({ ok: false, error: "unauthorized" }, 401);
  const svc = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  let sent = 0, emailed = 0, skipped = 0;
  try {
    const { data: rows, error } = await svc
      .from("ih_entrants")
      .select("id, competitor_id, payer_email, video_url, payment_status, display_name, event, upload_reminders_sent, in_house_tournaments!inner(name, format, state, event_date, upload_deadline), competitors(email, first_name)")
      .is("video_url", null)
      .eq("payment_status", "paid");
    if (error) return json({ ok: false, error: error.message }, 500);

    const now = Date.now();
    for (const e of (rows || []) as any[]) {
      const t = Array.isArray(e.in_house_tournaments) ? e.in_house_tournaments[0] : e.in_house_tournaments;
      const c = Array.isArray(e.competitors) ? e.competitors[0] : e.competitors;
      if (!t || t.format !== "video" || t.state !== "open") continue;
      const deadline = t.upload_deadline ? new Date(t.upload_deadline) : (t.event_date ? new Date(`${t.event_date}T23:59:59-04:00`) : null);
      if (!deadline) continue;
      const hoursUntil = (deadline.getTime() - now) / 3600000;
      if (hoursUntil <= 0) continue;
      const win = windowFor(hoursUntil);
      if (!win) continue;

      const already: string[] = Array.isArray(e.upload_reminders_sent) ? e.upload_reminders_sent : [];
      if (already.includes(win)) { skipped++; continue; }

      const name = esc(c?.first_name || e.display_name || "there");
      const tname = esc(t.name || "your in-house tournament");
      const closesTxt = fmtET(deadline);

      // In-app (only linked competitors, pref-gated)
      if (e.competitor_id) {
        const { data: pref } = await svc.from("notification_prefs").select("enabled")
          .eq("competitor_id", e.competitor_id).eq("type", "upload_reminder").maybeSingle();
        if (!(pref && pref.enabled === false)) {
          await svc.from("notifications").insert({
            competitor_id: e.competitor_id, type: "upload_reminder",
            title: "Upload reminder ⏰",
            body: `Upload your video for ${t.name} — closes ${windowLabel(win)} (${closesTxt}).`,
            data: { ih_entrant_id: e.id, window: win },
          });
          sent++;
        }
      }

      // Email (payer_email, or the competitor's email)
      const email = (e.payer_email || c?.email || "").trim();
      if (email && RESEND_API_KEY) {
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#0b0b0d;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#f5f0e8">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141416;border:1px solid #26262b">
<tr><td style="padding:28px 32px 6px 32px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#C9A84C;letter-spacing:.08em">National Martial Arts Org.</div><div style="margin-top:7px"><span style="display:inline-block;background:#7c3aed;background:linear-gradient(90deg,#2563eb 0%,#7c3aed 52%,#dc2626 100%);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:5px 12px;border-radius:5px">Tournament League</span></div></td></tr>
<tr><td style="padding:8px 32px 4px 32px"><h1 style="margin:0;font-size:20px;font-weight:600">Upload your video ⏰</h1></td></tr>
<tr><td style="padding:8px 32px 20px 32px;font-size:15px;line-height:1.6;color:#d7d2c8">Hi ${name}, this is a reminder to upload your video for <strong>${tname}</strong>. The upload window closes <strong>${windowLabel(win)}</strong> — ${esc(closesTxt)}. Open the NMAO Compete app and submit your video before then so you're scored.</td></tr>
</table></td></tr></table></body></html>`;
        const rr = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "NMAO Tournament <support@nmao.us>", to: email, subject: `⏰ Upload your video for ${t.name} — closes ${closesTxt}`, html }),
        });
        if (rr.ok) emailed++;
      }

      // Mark this window sent (dedup for both competitor + guest entrants)
      await svc.from("ih_entrants").update({ upload_reminders_sent: [...already, win] }).eq("id", e.id);
    }
    return json({ ok: true, in_app: sent, emailed, skipped });
  } catch (err) {
    console.error("inhouse-upload-reminders error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
