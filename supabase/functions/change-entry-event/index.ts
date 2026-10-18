// =====================================================================
// EDGE FUNCTION: change-entry-event  (School Portal — fix a wrong-event signup)
// A school owner changes which EVENT an existing round entry is for, when a
// competitor signed up for the wrong one. Same entry row (id unchanged) so the
// payment / credit / entitlement all carry over — NO refund or re-charge. Only
// allowed while the round is still open/collecting (before divide), so there are
// no divisions / pods / judge scores / medals tied to the old event yet.
//
// A video already uploaded CARRIES OVER by default — most event changes are just
// a mislabeled entry (e.g. a traditional form entered under Open Forms), so the
// clip is actually correct for the new event. Pass clear_video:true for the rare
// case the video doesn't match; then it's cleared and the competitor is asked to
// re-upload. Either way the competitor is notified.
//
// AUTH: Verify JWT = ON. Caller must OWN the athlete's school.
// POST { entry_id, to_event, clear_video? } -> { ok, entry_id, to_event, cleared_video }
// Deploy (editor-safe, no _shared): name = change-entry-event, Verify JWT ON.
// =====================================================================

// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY");
const ACCEPTING = ["open", "collecting"];

const EVENT_NAMES: Record<string, string> = {
  trad_forms: "Traditional Forms", trad_weapons: "Traditional Weapons",
  open_forms: "Open Forms", open_weapons: "Open Weapons",
};
const evtName = (c: string) => EVENT_NAMES[c] || c;
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const entryId = String(body.entry_id || "").trim();
    const toEvent = String(body.to_event || "").trim();
    if (!entryId || !toEvent) return json({ ok: false, error: "entry_id and to_event are required." }, 400);

    // Load the entry.
    const { data: entry } = await svc.from("entries")
      .select("id, round_id, competitor_id, event, status, payment_status, video_url, video_url_2")
      .eq("id", entryId).maybeSingle();
    if (!entry) return json({ ok: false, error: "Entry not found." }, 404);
    const e = entry as any;
    if (e.event === toEvent) return json({ ok: false, error: "That entry is already in that event." }, 400);

    // Caller must own the athlete's school.
    const { data: comp } = await svc.from("competitors").select("school_id, email, first_name, last_name").eq("id", e.competitor_id).maybeSingle();
    if (!comp) return json({ ok: false, error: "Athlete not found." }, 404);
    const { data: owned } = await svc.from("schools").select("id").eq("auth_user_id", uid);
    const ownedIds = new Set(((owned ?? []) as any[]).map((r) => r.id));
    if (!ownedIds.has((comp as any).school_id)) return json({ ok: false, error: "Not your athlete." }, 403);
    const schoolId = (comp as any).school_id;

    // Target event must be a real event.
    const { data: et } = await svc.from("event_types").select("code").eq("code", toEvent).maybeSingle();
    if (!et) return json({ ok: false, error: "Unknown event." }, 400);

    // Round must still be open for entries (before divide — nothing is bucketed/judged yet).
    const { data: round } = await svc.from("rounds").select("id, state").eq("id", e.round_id).maybeSingle();
    if (!round) return json({ ok: false, error: "Round not found." }, 404);
    if (!ACCEPTING.includes((round as any).state)) {
      return json({ ok: false, error: "This round has closed — events are locked and can no longer be changed." }, 409);
    }

    // Duplicate guard: the competitor can't already have an entry in the target
    // event this round (unique round_id,competitor_id,event).
    const { data: dup } = await svc.from("entries").select("id")
      .eq("round_id", e.round_id).eq("competitor_id", e.competitor_id).eq("event", toEvent).maybeSingle();
    if (dup) return json({ ok: false, error: `This competitor already has a ${evtName(toEvent)} entry this round.` }, 409);

    const hadVideo = !!(e.video_url || e.video_url_2);
    // Keep the video by default (usually just a mislabeled entry). Only clear it
    // when the owner says it doesn't match the new event.
    const clearVideo = body.clear_video === true && hadVideo;

    // Apply the change on the SAME row — payment/credit/entitlement untouched.
    // age_bracket / declared_rank / rating_at_entry do not depend on the event,
    // so they stay. The video carries over unless the owner asked to clear it.
    const patch: Record<string, unknown> = { event: toEvent, updated_at: new Date().toISOString() };
    if (clearVideo) { patch.video_url = null; patch.video_url_2 = null; }
    const { error: uerr } = await svc.from("entries").update(patch).eq("id", entryId);
    if (uerr) {
      console.error("change-entry-event update:", uerr);
      // A unique-violation here means a concurrent entry appeared for the target event.
      if ((uerr as any).code === "23505") return json({ ok: false, error: `This competitor already has a ${evtName(toEvent)} entry this round.` }, 409);
      return json({ ok: false, error: "Could not change the event." }, 500);
    }

    // Audit (best-effort — the change already succeeded; don't fail on a log miss).
    try {
      await svc.from("entry_event_changes").insert({
        entry_id: entryId, round_id: e.round_id, competitor_id: e.competitor_id, school_id: schoolId,
        from_event: e.event, to_event: toEvent, cleared_video: clearVideo, changed_by: uid,
      });
    } catch (ae) { console.error("entry_event_changes audit:", (ae as Error).message); }

    // Notify the competitor (owner-initiated account event — important, not gated).
    const toName = evtName(toEvent);
    const title = clearVideo ? "Event changed — re-upload needed" : "Your event was changed";
    const bodyMsg = clearVideo
      ? `Your school moved your entry to ${toName}. Your previous video was removed — please upload a new ${toName} video in the Compete app.`
      : hadVideo
        ? `Your school moved your entry to ${toName}. Your uploaded video carries over — double-check it's a ${toName} performance.`
        : `Your school moved your entry to ${toName}. Make sure you compete in ${toName} this round.`;
    try {
      await svc.from("notifications").insert({
        competitor_id: e.competitor_id, type: "event_changed",
        title, body: bodyMsg,
        data: { entry_id: entryId, from_event: e.event, to_event: toEvent, cleared_video: clearVideo },
      });
    } catch (ne) { console.error("event_changed notification:", (ne as Error).message); }

    // Best-effort email.
    const email = ((comp as any).email || "").trim();
    if (RESEND && email) {
      try {
        const name = esc((comp as any).first_name || "there");
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#0b0b0d;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#f5f0e8">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141416;border:1px solid #26262b">
<tr><td style="padding:28px 32px 6px 32px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:21px;color:#C9A84C;letter-spacing:.08em">National Martial Arts Org.</div></td></tr>
<tr><td style="padding:8px 32px 4px 32px"><h1 style="margin:0;font-size:20px;font-weight:600">Your event was changed</h1></td></tr>
<tr><td style="padding:8px 32px 20px 32px;font-size:15px;line-height:1.6;color:#d7d2c8">Hi ${name}, your school changed your entry to <strong>${esc(toName)}</strong>.${clearVideo ? " Your previous video was removed — please open the NMAO Compete app and upload a new video for this event before the round closes." : hadVideo ? " Your uploaded video carries over — just double-check it's a " + esc(toName) + " performance." : " Make sure you compete in this event this round."}</td></tr>
</table></td></tr></table></body></html>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: "Bearer " + RESEND, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "NMAO Compete <support@nmao.us>", to: email, subject: `Your entry is now ${toName}`, html }),
        });
      } catch (ee) { console.error("event_changed email:", (ee as Error).message); }
    }

    return json({ ok: true, entry_id: entryId, to_event: toEvent, cleared_video: hadVideo }, 200);
  } catch (e: any) {
    console.error("change-entry-event error:", e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
