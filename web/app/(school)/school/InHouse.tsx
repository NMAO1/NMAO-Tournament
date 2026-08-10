"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { neutrals, hues, status } from "@nmao/design-tokens";
import RunTournament from "./RunTournament";

type Tournament = { id: string; name: string; event_date: string | null; state: string; visibility: string; format: string; entry_fee_cents: number | null; platform_fee_bps: number; registration_open: boolean; public_token: string; scoring_mode: string; criteria: string[] | null; include_unpaid: boolean };
type Entrant = { id: string; competitor_id: string | null; display_name: string | null; event: string | null; division: string | null; score: number | null; placement: number | null; prize: string | null; payment_status: string; self_registered: boolean; video_url: string | null; scores: Record<string, number> | null };
type RosterLite = { id: string; first_name: string; last_name: string };

// NMAO's preset in-house rubric (used when scoring_mode = 'nmao').
const NMAO_CRITERIA = ["Technique", "Power", "Balance", "Timing", "Presentation", "Difficulty"];
const MAX_CRITERIA = 10;

// Challenges are freeform — these are just autocomplete suggestions. A school
// can type anything: a physical challenge (board breaking, sparring, fitness) or
// a classic forms/weapons division.
const SUGGESTED = ["Traditional Forms", "Traditional Weapons", "Open Forms", "Open Weapons", "Board Breaking", "Sparring", "Fitness Challenge", "Creative"];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nmao.us/app";
// In-house has no judging engine, so the only meaningful states are: draft
// (config editable), live (created & running), and complete (closed).
const stateLabel = (s: string) => (s === "draft" ? "Draft" : s === "complete" ? "Complete" : "Live");
const stateColor = (s: string) => (s === "complete" ? hues.gold.hi : s === "judging" ? "#7DAAD4" : s === "open" ? "#7ED0A0" : neutrals.muted);
const eventName = (c: string | null) => c || "—";
const dollars = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
// School's take-home after our platform cut and Stripe's ~2.9% + 30¢ (direct charge → school pays Stripe fees).
const netPerEntry = (fee: number, bps: number) => Math.max(0, fee - Math.round((fee * bps) / 10000) - Math.round(fee * 0.029) - 30);

export default function InHouse({ schoolId, roster }: { schoolId: string; roster: RosterLite[] }) {
  const supabase = createClient();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [entrantForm, setEntrantForm] = useState({ event: "", division: "" });
  const [search, setSearch] = useState("");
  const [selComps, setSelComps] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  const [running, setRunning] = useState(false);

  const inp: React.CSSProperties = { padding: "9px 11px", borderRadius: 9, border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, fontSize: 14 };
  const card = { background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 14 } as const;
  const gold = { border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "9px 18px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` } as const;
  const ghost: React.CSSProperties = { border: `1px solid ${neutrals.border}`, background: "transparent", color: neutrals.text, borderRadius: 9, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 };

  const loadTournaments = useCallback(async () => {
    const { data } = await supabase.from("in_house_tournaments")
      .select("id, name, event_date, state, visibility, format, entry_fee_cents, platform_fee_bps, registration_open, public_token, scoring_mode, criteria, include_unpaid")
      .eq("school_id", schoolId).order("created_at", { ascending: false });
    setTournaments((data ?? []) as Tournament[]);
  }, [supabase, schoolId]);
  useEffect(() => { loadTournaments(); }, [loadTournaments]);

  async function loadEntrants(tid: string) {
    const { data } = await supabase.from("ih_entrants")
      .select("id, competitor_id, display_name, event, division, score, placement, prize, payment_status, self_registered, video_url, scores")
      .eq("tournament_id", tid).order("placement", { ascending: true, nullsFirst: false });
    setEntrants((data ?? []) as Entrant[]);
  }
  async function select(tid: string) { setSelected(tid); loadEntrants(tid); }

  async function createTournament() {
    if (!newName.trim()) { setErr("Name is required."); return; }
    setErr("");
    const { data, error } = await supabase.from("in_house_tournaments").insert({ school_id: schoolId, name: newName.trim(), event_date: newDate || null }).select("id").single();
    if (error) { setErr(error.message); return; }
    setNewName(""); setNewDate("");
    await loadTournaments();
    if (data) select((data as { id: string }).id);
  }
  function patchLocal(tid: string, patch: Partial<Tournament>) { setTournaments((t) => t.map((x) => (x.id === tid ? { ...x, ...patch } : x))); }
  async function updateTournament(tid: string, patch: Partial<Tournament>) {
    patchLocal(tid, patch);
    const { error } = await supabase.from("in_house_tournaments").update(patch).eq("id", tid);
    if (error) setErr(error.message);
  }
  function changeState(t: Tournament, next: string) {
    if (next === t.state) return;
    const msg: Record<string, string> = {
      open: `Open “${t.name}” for registration and entries?`,
      judging: `Close entries for “${t.name}” and move to judging?`,
      complete: `Mark “${t.name}” complete? Results become final.`,
      draft: `Move “${t.name}” back to draft?`,
    };
    if (!window.confirm(msg[next] ?? `Change status to ${next}?`)) return;
    updateTournament(t.id, { state: next });
  }
  function createTournamentCommit(t: Tournament) {
    if (t.scoring_mode === "custom" && (t.criteria?.length ?? 0) === 0) { setErr("Add at least one scoring criterion before creating."); return; }
    if (!window.confirm(`Create “${t.name}”?\n\nEntry fee, format, and scoring will be locked in so they can't be changed by accident. You can reopen them anytime with “Edit setup”.`)) return;
    setErr("");
    updateTournament(t.id, { state: "open" });
  }
  function editSetup(t: Tournament) {
    if (!window.confirm(`Reopen setup for “${t.name}”?\n\nThis unlocks the entry fee, format, and scoring. Public sign-ups pause until you create it again.`)) return;
    updateTournament(t.id, { state: "draft" });
  }
  function toggleComp(id: string) { setSelComps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  async function addEntrants() {
    if (!selected || selComps.length === 0) return;
    const t = tournaments.find((x) => x.id === selected);
    const evKey = entrantForm.event.trim() || null;
    // Skip anyone already entered in this same event — avoids a duplicate finalize reminder.
    const already = new Set(entrants.filter((e) => (e.event ?? null) === evKey && e.competitor_id).map((e) => e.competitor_id as string));
    const toAdd = selComps.filter((cid) => !already.has(cid));
    const skipped = selComps.length - toAdd.length;
    if (toAdd.length === 0) { setErr("Everyone selected is already entered in that event."); setSelComps([]); return; }
    const n = toAdd.length;
    if (!window.confirm(`Add ${n} competitor${n === 1 ? "" : "s"} to “${t?.name ?? "this tournament"}”?${skipped ? ` (${skipped} already entered — skipping)` : ""}\n\nThey'll be entered as unpaid and prompted to finalize their registration in the app.`)) return;
    const rows = toAdd.map((cid) => {
      const a = roster.find((r) => r.id === cid);
      return {
        tournament_id: selected, competitor_id: cid,
        display_name: a ? `${a.first_name} ${a.last_name}` : null,
        event: evKey, division: entrantForm.division || null,
      };
    });
    const { error } = await supabase.from("ih_entrants").insert(rows);
    if (error) { setErr(error.message); return; }
    setErr(""); setSelComps([]); setSearch(""); setEntrantForm((f) => ({ ...f, division: "" }));
    loadEntrants(selected);
  }
  async function updateEntrant(id: string, patch: Partial<Entrant>) {
    setEntrants((e) => e.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await supabase.from("ih_entrants").update(patch).eq("id", id);
  }
  async function removeEntrant(id: string) {
    setEntrants((e) => e.filter((x) => x.id !== id));
    await supabase.from("ih_entrants").delete().eq("id", id);
  }
  function copy(text: string, tag: string) { navigator.clipboard?.writeText(text); setCopied(tag); setTimeout(() => setCopied(""), 1800); }
  async function watchVideo(entrantId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-inhouse-video-url`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ entrant_id: entrantId }),
      });
      const j = await res.json();
      if (j.ok && j.url) window.open(j.url, "_blank", "noopener");
      else setErr(j.error || "Video unavailable.");
    } catch { setErr("Could not load video."); }
  }

  const cur = tournaments.find((t) => t.id === selected);
  const cellInp: React.CSSProperties = { ...inp, padding: "6px 8px", width: 64, fontSize: 13, textAlign: "center" };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fee = cur?.entry_fee_cents ?? 0;
  const isPublic = cur?.visibility === "public";
  const isVideo = cur?.format === "video";
  const paidCount = entrants.filter((e) => e.payment_status === "paid").length;
  const challengeOpts = Array.from(new Set([...(entrants.map((e) => e.event).filter(Boolean) as string[]), ...SUGGESTED]));
  const q = search.trim().toLowerCase();
  const filtered = q ? roster.filter((r) => `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)) : roster;
  const isDraft = cur?.state === "draft";
  const sumLbl: React.CSSProperties = { fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: neutrals.muted2, marginBottom: 3 };
  const sumVal: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: neutrals.text };
  const isCustom = cur?.scoring_mode === "custom";
  const critList = cur ? (isCustom ? (cur.criteria ?? []) : NMAO_CRITERIA) : [];
  const eligible = cur ? entrants.filter((e) => (cur.entry_fee_cents ?? 0) <= 0 || cur.include_unpaid || e.payment_status !== "unpaid") : [];
  const setCriterion = (idx: number, val: string) => { if (!cur) return; const next = [...(cur.criteria ?? [])]; next[idx] = val; patchLocal(cur.id, { criteria: next }); };
  const saveCriteria = () => { if (cur) supabase.from("in_house_tournaments").update({ criteria: cur.criteria ?? [] }).eq("id", cur.id).then(() => {}); };
  const addCriterion = () => { if (cur && (cur.criteria?.length ?? 0) < MAX_CRITERIA) updateTournament(cur.id, { criteria: [...(cur.criteria ?? []), ""] }); };
  const removeCriterion = (idx: number) => { if (cur) updateTournament(cur.id, { criteria: (cur.criteria ?? []).filter((_, i) => i !== idx) }); };

  return (
    <>
      {err && <p style={{ color: status.danger, marginBottom: 12 }}>{err}</p>}

      {/* create */}
      <div style={{ ...card, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: neutrals.muted2, marginBottom: 12 }}>Host a tournament</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10 }}>
          <input style={inp} placeholder="Tournament name (e.g. Spring Belt Classic)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input style={inp} type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <button onClick={createTournament} style={gold}>Create</button>
        </div>
        <div style={{ color: neutrals.muted2, fontSize: 12, marginTop: 10 }}>In-house results stay local — no effect on NMAO rating, points, or medals. Set an entry fee after creating.</div>
      </div>

      {/* list */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {tournaments.length === 0 && <p style={{ color: neutrals.muted2, fontSize: 14 }}>No tournaments yet — host your first above.</p>}
        {tournaments.map((t) => (
          <button key={t.id} onClick={() => select(t.id)}
            style={{ textAlign: "left", background: selected === t.id ? neutrals.surface2 : neutrals.surface, border: `1px solid ${selected === t.id ? hues.gold.shadow : neutrals.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", minWidth: 200 }}>
            <div style={{ color: neutrals.text, fontWeight: 600, fontSize: 15 }}>{t.name}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: neutrals.muted }}>
              {t.event_date ?? "no date"} · <span style={{ color: stateColor(t.state), fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{stateLabel(t.state)}</span>
              {t.entry_fee_cents ? ` · $${dollars(t.entry_fee_cents)}` : " · free"}
            </div>
          </button>
        ))}
      </div>

      {/* selected tournament */}
      {cur && (
        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              {cur.name}
              {isDraft
                ? <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: hues.gold.hi, border: `1px solid ${hues.gold.shadow}`, borderRadius: 6, padding: "2px 7px" }}>Draft</span>
                : <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: neutrals.muted, border: `1px solid ${neutrals.border}`, borderRadius: 6, padding: "2px 7px" }}>{cur.format === "video" ? "Video" : "In-person"}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isDraft ? (
                <div style={{ display: "flex", border: `1px solid ${neutrals.border}`, borderRadius: 9, overflow: "hidden" }}>
                  {[{ v: "in_person", l: "In-person" }, { v: "video", l: "Video" }].map((o) => (
                    <button key={o.v} onClick={() => updateTournament(cur.id, { format: o.v })}
                      style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "8px 13px", background: cur.format === o.v ? hues.gold.base : "transparent", color: cur.format === o.v ? "#141210" : neutrals.muted }}>{o.l}</button>
                  ))}
                </div>
              ) : cur.state === "complete" ? (
                <>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#7ED0A0", border: "1px solid #2E5B44", borderRadius: 6, padding: "5px 9px" }}>Completed</span>
                  <button onClick={() => changeState(cur, "open")} style={{ ...ghost, padding: "7px 14px" }}>Reopen</button>
                </>
              ) : (
                <>
                  <button onClick={() => editSetup(cur)} style={{ ...ghost, padding: "7px 14px" }}>Edit setup</button>
                  <button onClick={() => changeState(cur, "complete")} style={{ ...ghost, padding: "7px 14px" }}>Mark complete</button>
                </>
              )}
            </div>
          </div>

          {isDraft ? (
            <>
              {/* editable config: payments */}
              <div style={{ background: "#0e0e11", border: `1px solid ${neutrals.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 13, color: neutrals.muted }}>
                    Entry fee
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                      <span style={{ color: neutrals.muted2 }}>$</span>
                      <input style={{ ...inp, width: 90 }} type="number" min="0" step="1" defaultValue={dollars(cur.entry_fee_cents)} placeholder="0.00"
                        onBlur={(e) => updateTournament(cur.id, { entry_fee_cents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} />
                    </div>
                  </label>
                  <div style={{ fontSize: 12, color: neutrals.muted, lineHeight: 1.7 }}>
                    Platform fee: <b style={{ color: neutrals.text }}>{(cur.platform_fee_bps / 100).toFixed(0)}%</b><br />
                    {fee > 0
                      ? <>You receive ≈ <b style={{ color: "#7ED0A0" }}>${dollars(netPerEntry(fee, cur.platform_fee_bps))}</b> per paid entry <span style={{ color: neutrals.muted2 }}>(after platform + card fees)</span></>
                      : <span style={{ color: neutrals.muted2 }}>Free event — no payment collected.</span>}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: neutrals.text, cursor: "pointer", marginLeft: "auto" }}>
                    <input type="checkbox" checked={isPublic} onChange={(e) => updateTournament(cur.id, { visibility: e.target.checked ? "public" : "school_only" })} />
                    Public sign-ups
                  </label>
                </div>
              </div>

              {/* editable config: scoring */}
              <div style={{ background: "#0e0e11", border: `1px solid ${neutrals.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: neutrals.muted2, marginBottom: 12 }}>Scoring &amp; judging</div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", border: `1px solid ${neutrals.border}`, borderRadius: 9, overflow: "hidden" }}>
                    {[{ v: "nmao", l: "NMAO criteria" }, { v: "custom", l: "Custom" }].map((o) => (
                      <button key={o.v} onClick={() => updateTournament(cur.id, { scoring_mode: o.v })}
                        style={{ border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "8px 13px", background: cur.scoring_mode === o.v ? hues.gold.base : "transparent", color: cur.scoring_mode === o.v ? "#141210" : neutrals.muted }}>{o.l}</button>
                    ))}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: neutrals.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={cur.include_unpaid} onChange={(e) => updateTournament(cur.id, { include_unpaid: e.target.checked })} />
                    Include unpaid entrants
                  </label>
                </div>
                {isCustom ? (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ color: neutrals.muted2, fontSize: 12, marginBottom: 8 }}>Your criteria — judges enter a number for each:</div>
                    {(cur.criteria ?? []).map((c, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <input style={{ ...inp, flex: 1 }} placeholder={`Criterion ${idx + 1} (e.g. Technique)`} value={c} onChange={(e) => setCriterion(idx, e.target.value)} onBlur={saveCriteria} />
                        <button onClick={() => removeCriterion(idx)} style={{ ...ghost, padding: "6px 12px" }}>Remove</button>
                      </div>
                    ))}
                    {(cur.criteria?.length ?? 0) < MAX_CRITERIA && <button onClick={addCriterion} style={{ ...ghost }}>+ Add criterion</button>}
                    {(cur.criteria?.length ?? 0) === 0 && <div style={{ color: hues.gold.hi, fontSize: 12, marginTop: 8 }}>Add at least one criterion.</div>}
                  </div>
                ) : (
                  <div style={{ marginTop: 14, color: neutrals.muted, fontSize: 13 }}>Scoring on NMAO&apos;s rubric: {NMAO_CRITERIA.join(" · ")}.</div>
                )}
              </div>

              {/* commit */}
              <button onClick={() => createTournamentCommit(cur)} style={{ ...gold, width: "100%", padding: "12px" }}>Create tournament</button>
              <p style={{ color: neutrals.muted2, fontSize: 12, textAlign: "center", margin: "8px 0 4px" }}>Locks the entry fee, format, and scoring. Reopen anytime with “Edit setup”.</p>
            </>
          ) : (
            <>
              {/* locked config summary */}
              <div style={{ background: "#0e0e11", border: `1px solid ${neutrals.border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 14, display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
                <div><div style={sumLbl}>Entry fee</div><div style={sumVal}>{fee > 0 ? `$${dollars(cur.entry_fee_cents)}` : "Free"}</div></div>
                <div><div style={sumLbl}>Format</div><div style={sumVal}>{cur.format === "video" ? "Video" : "In-person"}</div></div>
                <div><div style={sumLbl}>Scoring</div><div style={sumVal}>{isCustom ? `Custom · ${cur.criteria?.length ?? 0} criteria` : "NMAO rubric"}</div></div>
                <div><div style={sumLbl}>Public sign-ups</div><div style={sumVal}>{isPublic ? "On" : "Off"}</div></div>
                <div><div style={sumLbl}>Unpaid compete</div><div style={sumVal}>{cur.include_unpaid ? "Yes" : "No"}</div></div>
              </div>

              {/* public link (operational) */}
              {isPublic && (
                <div style={{ background: "#0e0e11", border: `1px solid ${neutrals.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: neutrals.muted, marginBottom: 6 }}>Share this link — parents register their athlete and pay themselves:</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <code style={{ background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: hues.gold.hi, wordBreak: "break-all" }}>{origin}/inhouse/{cur.public_token}</code>
                    <button style={ghost} onClick={() => copy(`${origin}/inhouse/${cur.public_token}`, "reg")}>{copied === "reg" ? "Copied ✓" : "Copy link"}</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                    <span style={{ color: neutrals.muted2, fontSize: 12 }}>App download (for athletes new to NMAO):</span>
                    <code style={{ background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: neutrals.muted, wordBreak: "break-all" }}>{APP_URL}</code>
                    <button style={ghost} onClick={() => copy(APP_URL, "app")}>{copied === "app" ? "Copied ✓" : "Copy"}</button>
                  </div>
                </div>
              )}

              {/* run tournament */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: neutrals.muted2, fontSize: 12 }}>{eligible.length} eligible to judge</span>
                <button onClick={() => setRunning(true)} disabled={!eligible.length || (isCustom && (cur.criteria?.length ?? 0) === 0)} style={{ ...gold, opacity: (!eligible.length || (isCustom && (cur.criteria?.length ?? 0) === 0)) ? 0.5 : 1 }}>▶ Run tournament</button>
              </div>
            </>
          )}

          {!isDraft && (<>
          {/* add competitors */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: neutrals.muted2 }}>Add Competitors</div>
            {selComps.length > 0 && <button onClick={() => setSelComps([])} style={{ background: "none", border: "none", color: neutrals.muted2, cursor: "pointer", fontSize: 12 }}>Clear ({selComps.length})</button>}
          </div>
          <datalist id="ih-challenges">{challengeOpts.map((c) => <option key={c} value={c} />)}</datalist>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input style={inp} list="ih-challenges" placeholder="Event / challenge (applies to all selected)" value={entrantForm.event} onChange={(e) => setEntrantForm({ ...entrantForm, event: e.target.value })} />
            <input style={inp} placeholder="Division (optional)" value={entrantForm.division} onChange={(e) => setEntrantForm({ ...entrantForm, division: e.target.value })} />
          </div>
          <input style={{ ...inp, width: "100%", marginBottom: 8 }} placeholder="Search your roster…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!roster.length ? (
            <p style={{ color: neutrals.muted2, fontSize: 13 }}>Add athletes to your roster first (Roster tab).</p>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${neutrals.border}`, borderRadius: 10, marginBottom: 10 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: "12px 14px", color: neutrals.muted2, fontSize: 13 }}>No competitors match “{search}”.</div>
              ) : filtered.map((r) => {
                const on = selComps.includes(r.id);
                return (
                  <button key={r.id} onClick={() => toggleComp(r.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: `1px solid ${neutrals.border}`, cursor: "pointer", background: on ? "rgba(230,185,63,0.10)" : "transparent", color: neutrals.text }}>
                    <span style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid ${on ? hues.gold.base : neutrals.border}`, background: on ? hues.gold.base : "transparent", color: "#141210", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                    {r.first_name} {r.last_name}
                  </button>
                );
              })}
            </div>
          )}
          <button onClick={addEntrants} disabled={!selComps.length} style={{ ...gold, opacity: selComps.length ? 1 : 0.5, marginBottom: 16 }}>
            {selComps.length ? `Add ${selComps.length} Competitor${selComps.length === 1 ? "" : "s"}` : "Add Competitors"}
          </button>

          {/* entrants table */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: neutrals.muted2 }}>Entrants</div>
            {entrants.length > 0 && <div style={{ fontSize: 12, color: neutrals.muted }}>{paidCount} paid · {entrants.length} total</div>}
          </div>
          {entrants.length === 0 ? (
            <p style={{ color: neutrals.muted2, fontSize: 14 }}>No entrants yet — add athletes above, or share the public link.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: neutrals.muted2, textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", fontWeight: 500 }}>Athlete</th><th style={{ fontWeight: 500 }}>Event</th><th style={{ fontWeight: 500 }}>Division</th>
                    {isVideo && <th style={{ fontWeight: 500 }}>Video</th>}
                    <th style={{ fontWeight: 500 }}>Payment</th><th style={{ fontWeight: 500 }}>Score</th><th style={{ fontWeight: 500 }}>Place</th><th style={{ fontWeight: 500 }}>Prize</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {entrants.map((en) => (
                    <tr key={en.id} style={{ borderTop: `1px solid ${neutrals.border}` }}>
                      <td style={{ padding: "8px 6px", color: neutrals.text }}>
                        {en.display_name ?? "—"}
                        {en.self_registered && <span style={{ marginLeft: 6, fontSize: 10, color: neutrals.muted2, border: `1px solid ${neutrals.border}`, borderRadius: 5, padding: "1px 5px" }}>self</span>}
                      </td>
                      <td style={{ color: neutrals.muted }}>{eventName(en.event)}</td>
                      <td style={{ color: neutrals.muted }}>{en.division ?? "—"}</td>
                      {isVideo && (
                        <td>
                          {en.video_url
                            ? <button onClick={() => watchVideo(en.id)} style={{ background: "none", border: "none", padding: 0, color: hues.gold.hi, fontSize: 12, cursor: "pointer" }}>Watch ↗</button>
                            : <span style={{ color: neutrals.muted2, fontSize: 12 }}>Awaiting video</span>}
                        </td>
                      )}
                      <td>
                        {en.payment_status === "paid" ? (
                          <span style={{ color: "#7ED0A0", fontWeight: 700 }}>Paid</span>
                        ) : en.payment_status === "waived" ? (
                          <span style={{ color: neutrals.muted }}>Waived</span>
                        ) : fee > 0 ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button style={{ ...ghost, padding: "4px 9px" }} onClick={() => copy(`${origin}/inhouse/pay/${en.id}`, "pay-" + en.id)}>{copied === "pay-" + en.id ? "Copied ✓" : "Finalize link"}</button>
                            <button style={{ background: "none", border: "none", color: neutrals.muted2, cursor: "pointer", fontSize: 11 }} title="Record a cash / in-person payment" onClick={() => updateEntrant(en.id, { payment_status: "waived" })}>cash</button>
                          </div>
                        ) : (
                          <span style={{ color: neutrals.muted2 }}>free</span>
                        )}
                      </td>
                      <td><input style={cellInp} defaultValue={en.score ?? ""} placeholder="—" onBlur={(e) => updateEntrant(en.id, { score: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td><input style={cellInp} defaultValue={en.placement ?? ""} placeholder="—" onBlur={(e) => updateEntrant(en.id, { placement: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td><input style={{ ...inp, padding: "6px 8px", fontSize: 13, width: 150 }} defaultValue={en.prize ?? ""} placeholder="Prize" onBlur={(e) => updateEntrant(en.id, { prize: e.target.value || null })} /></td>
                      <td><button onClick={() => removeEntrant(en.id)} style={{ background: "none", border: "none", color: neutrals.muted2, cursor: "pointer", fontSize: 12 }}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </>)}
        </div>
      )}

      {running && cur && (
        <RunTournament
          tournament={{ id: cur.id, name: cur.name, format: cur.format }}
          criteria={critList}
          entrants={eligible.map((e) => ({ id: e.id, display_name: e.display_name, event: e.event, division: e.division, video_url: e.video_url, scores: e.scores, score: e.score, placement: e.placement }))}
          onClose={() => { setRunning(false); if (selected) loadEntrants(selected); }}
          onSaved={() => { if (selected) loadEntrants(selected); }}
          onWatch={watchVideo}
        />
      )}
    </>
  );
}
