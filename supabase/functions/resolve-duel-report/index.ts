// =====================================================================
// EDGE FUNCTION: resolve-duel-report  (Mission Control — duel moderation)
// Staff review queue for reported duels (incl. the "wrong_password" quorum).
//   action=list    -> flagged (under_review) duels + their reporters (names for
//                     accountability / spotting serial false-reporters) + videos.
//   action=uphold  -> disqualify: set the duel to NO-CONTEST + removed (no rating
//                     change, per the chosen repercussion), reports -> upheld.
//   action=dismiss -> back to voting (moderation ok), reports -> dismissed.
// AUTH: Verify JWT = ON. NMAO staff only (staff.auth_user_id).
// POST { action, duel_id? } -> { ok, ... }
// Deploy: name = resolve-duel-report, Verify JWT ON.
// =====================================================================
// deno-lint-ignore-file no-explicit-any
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);
  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);
  const { data: staff } = await svc.from("staff").select("id").eq("auth_user_id", uid).maybeSingle();
  if (!staff) return json({ ok: false, error: "Not authorized — NMAO staff only." }, 403);
  // RBAC: any moderation grant can view the queue; acting (uphold/dismiss) needs full.
  const { data: _modView } = await svc.rpc("staff_can_uid", { p_uid: uid, p_slice: "moderation", p_level: "view" });
  if (!_modView) return json({ ok: false, error: "Not authorized for moderation." }, 403);
  const canModerate = async () => {
    const { data } = await svc.rpc("staff_can_uid", { p_uid: uid, p_slice: "moderation", p_level: "full" });
    return data === true;
  };

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");
    const now = new Date().toISOString();

    if (action === "list") {
      const { data: duels } = await svc.from("duels")
        .select("id, type, status, moderation_status, challenger_id, opponent_id, challenger_video, opponent_video, closes_vote_at")
        .eq("moderation_status", "under_review").order("closes_vote_at", { ascending: true }).limit(100);
      const rows = (duels || []) as any[];
      if (!rows.length) return json({ ok: true, duels: [] });

      const ids = rows.map((d) => d.id);
      const compIds = [...new Set(rows.flatMap((d) => [d.challenger_id, d.opponent_id]).filter(Boolean))];
      const [{ data: reports }, { data: comps }] = await Promise.all([
        svc.from("duel_reports")
          .select("duel_id, target, reason, created_at, reporter:reporter_competitor_id(first_name,last_name)")
          .in("duel_id", ids).eq("status", "pending"),
        svc.from("competitors").select("id, first_name, last_name").in("id", compIds),
      ]);
      const nameOf: Record<string, string> = {};
      for (const c of (comps || []) as any[]) nameOf[c.id] = `${c.first_name} ${c.last_name}`.trim();
      const byDuel: Record<string, any[]> = {};
      for (const r of (reports || []) as any[]) {
        const rn = r.reporter ? `${r.reporter.first_name} ${r.reporter.last_name}`.trim() : "—";
        (byDuel[r.duel_id] ||= []).push({ reason: r.reason, target: r.target, reporter: rn, at: r.created_at });
      }
      const out = rows.map((d) => {
        const reps = byDuel[d.id] || [];
        const pw = reps.filter((x) => x.reason === "wrong_password").length;
        return {
          duel_id: d.id, type: d.type, status: d.status,
          challenger: nameOf[d.challenger_id] || "?", opponent: nameOf[d.opponent_id] || "?",
          challenger_video: d.challenger_video, opponent_video: d.opponent_video,
          reports: reps, wrong_password_count: pw,
        };
      });
      return json({ ok: true, duels: out });
    }

    const duelId = String(body.duel_id || "").trim();
    if (!duelId) return json({ ok: false, error: "duel_id required." }, 400);

    if (action === "uphold") {
      if (!(await canModerate())) return json({ ok: false, error: "Triage only — resolving reports requires the Tournament role." }, 403);
      // Find the offending side (most-reported target) unless staff named one.
      const { data: d } = await svc.from("duels").select("challenger_id, opponent_id").eq("id", duelId).maybeSingle();
      const { data: reps } = await svc.from("duel_reports").select("target").eq("duel_id", duelId).eq("status", "pending");
      const tally: Record<string, number> = {};
      for (const r of (reps || []) as any[]) tally[r.target] = (tally[r.target] || 0) + 1;
      const side = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
      let offender: string | null = body.ban_competitor_id ? String(body.ban_competitor_id) : null;
      if (!offender && d) offender = side === "opponent" ? (d as any).opponent_id : side === "challenger" ? (d as any).challenger_id : null;

      // Disqualify → NO CONTEST (no rating change), video removed.
      await svc.from("duels").update({
        status: "no_contest", result: "no_contest", winner_id: null,
        moderation_status: "removed", resolved_at: now, updated_at: now,
      }).eq("id", duelId);
      await svc.from("duel_reports").update({ status: "upheld", resolved_by: uid, resolved_at: now })
        .eq("duel_id", duelId).eq("status", "pending");

      // Eject the user who provided the offending content (App Store 1.2).
      let ejected: string | null = null;
      if (offender) {
        await svc.from("competitors").update({ status: "banned", banned_at: now, banned_reason: "Objectionable content — upheld report" }).eq("id", offender);
        ejected = offender;
      }
      return json({ ok: true, result: "no_contest", ejected });
    }

    if (action === "dismiss") {
      if (!(await canModerate())) return json({ ok: false, error: "Triage only — resolving reports requires the Tournament role." }, 403);
      await svc.from("duels").update({ moderation_status: "ok", updated_at: now })
        .eq("id", duelId).eq("moderation_status", "under_review");
      await svc.from("duel_reports").update({ status: "dismissed", resolved_by: uid, resolved_at: now })
        .eq("duel_id", duelId).eq("status", "pending");
      return json({ ok: true, result: "voting" });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Failed." }, 500);
  }
});
