// =====================================================================
// EDGE FUNCTION: delete-account  (competitor / guardian self-service deletion)
// Apple App Store Guideline 5.1.1(v): an app that supports account creation MUST
// let the signed-in user initiate deletion of their account + personal data.
//
// The caller (a guardian, or a competitor with their own login) deletes THEIR
// OWN account:
//   - competitors they SOLELY control (own login, or a ward with no other
//     guardian and no separate login) are ANONYMIZED: PII scrubbed, detached,
//     status='deleted'. They're de-identified rather than hard-deleted so
//     interdependent tournament records (duels, pods, results, and OTHER
//     competitors' opponent history) stay intact; status='deleted' drops them
//     from every active surface (leaderboards filter status='active').
//   - shared wards (another guardian still exists) are simply detached.
//   - private journals + profile photos are hard-deleted.
//   - the guardian row is deleted (cascades its guardian_competitors links).
//   - the auth login is deleted (the account is gone).
//
// Refuses if the login also owns a school / is a judge / is staff — those roles
// must be removed by NMAO support, not silently nuked from the competitor app.
//
// AUTH: Verify JWT ON — the caller can only delete their OWN account.
// POST {} -> { ok, anonymized_competitors, detached_competitors }
// Deploy: name = delete-account, Verify JWT ON.
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
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ ok: false, error: "Sign in required." }, 401);

  // Confirm the caller and resolve their uid from the token.
  const authClient = createClient(URL_, ANON, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false } });
  const { data: u } = await authClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return json({ ok: false, error: "Invalid or expired session." }, 401);

  const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  try {
    // Guard: don't let a school-owner / judge / staff login self-delete here.
    for (const [tbl, label] of [["schools", "a school"], ["judges", "a judge"], ["staff", "staff"]] as const) {
      const { data } = await svc.from(tbl).select("id").eq("auth_user_id", uid).limit(1).maybeSingle();
      if (data) return json({ ok: false, error: `This login also manages ${label} account. Please contact NMAO support to delete it.` }, 409);
    }

    // 1. competitors this login IS (own login).
    const { data: own } = await svc.from("competitors").select("id").eq("auth_user_id", uid);
    const ownIds = (own ?? []).map((c: any) => c.id as string);

    // 2. guardian row + wards.
    const { data: g } = await svc.from("guardians").select("id").eq("auth_user_id", uid).maybeSingle();
    const guardianId = g?.id as string | undefined;
    let wardIds: string[] = [];
    if (guardianId) {
      const { data: gc } = await svc.from("guardian_competitors").select("competitor_id").eq("guardian_id", guardianId);
      wardIds = (gc ?? []).map((r: any) => r.competitor_id as string);
    }

    // 3. classify wards: solely-controlled (anonymize) vs shared (detach only).
    const soleWardIds: string[] = [];
    let detached = 0;
    for (const wid of wardIds) {
      const { data: w } = await svc.from("competitors").select("auth_user_id").eq("id", wid).maybeSingle();
      const hasOwnLogin = !!(w as any)?.auth_user_id && (w as any).auth_user_id !== uid;
      const { data: otherG } = await svc.from("guardian_competitors")
        .select("guardian_id, guardians!inner(auth_user_id)")
        .eq("competitor_id", wid)
        .neq("guardians.auth_user_id", uid);
      const hasOtherGuardian = ((otherG ?? []) as any[]).length > 0;
      if (hasOwnLogin || hasOtherGuardian) detached++;
      else soleWardIds.push(wid);
    }

    const anonIds = [...new Set([...ownIds, ...soleWardIds])];

    // 4. hard-delete private data + anonymize the solely-controlled competitors.
    if (anonIds.length) {
      // private journals
      await svc.from("journal_entries").delete().in("competitor_id", anonIds);
      // notifications (payloads may carry names) — best effort
      try { await svc.from("notifications").delete().in("competitor_id", anonIds); } catch (_) { /* table/col optional */ }
      // profile photos: remove the storage objects, then scrub the reference
      const { data: photoRows } = await svc.from("competitors").select("id, profile_photo_url").in("id", anonIds);
      const paths = (photoRows ?? [])
        .map((r: any) => r.profile_photo_url)
        .filter(Boolean)
        .map((url: string) => { const m = String(url).match(/\/profile-photos\/(.+)$/); return m ? m[1] : null; })
        .filter(Boolean) as string[];
      if (paths.length) { try { await svc.storage.from("profile-photos").remove(paths); } catch (_) { /* non-fatal */ } }

      const { error: cErr } = await svc.from("competitors").update({
        first_name: "Deleted", last_name: "Competitor", email: null,
        dob: "2000-01-01", auth_user_id: null, profile_photo_url: null,
        status: "deleted",
      }).in("id", anonIds);
      // Fatal: never delete the login while competitor PII might remain.
      if (cErr) return json({ ok: false, error: "Could not remove competitor data: " + cErr.message }, 500);
    }

    // 5. remove ward links + anonymize the guardian (the account owner). A hard
    //    delete is blocked by the consents FK (a COPPA legal record we keep), so
    //    we scrub the guardian's PII and detach the login instead.
    if (guardianId) {
      await svc.from("guardian_competitors").delete().eq("guardian_id", guardianId);
      const { error: gErr } = await svc.from("guardians").update({
        first_name: "Deleted", last_name: null, email: null, phone: null, auth_user_id: null,
      }).eq("id", guardianId);
      if (gErr) return json({ ok: false, error: "Could not remove guardian data: " + gErr.message }, 500);
    }

    // 6. delete the auth login — the account is now gone.
    const { error: delErr } = await svc.auth.admin.deleteUser(uid);
    if (delErr) return json({ ok: false, error: "Could not delete the login: " + delErr.message }, 500);

    return json({ ok: true, anonymized_competitors: anonIds.length, detached_competitors: detached });
  } catch (e) {
    console.error("delete-account error:", (e as Error)?.message || e);
    return json({ ok: false, error: (e as Error)?.message || "server_error" }, 500);
  }
});
