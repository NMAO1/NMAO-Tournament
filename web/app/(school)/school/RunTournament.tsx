"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { neutrals, hues } from "@nmao/design-tokens";

type Entrant = { id: string; display_name: string | null; event: string | null; division: string | null; video_url: string | null; scores: Record<string, number> | null; score: number | null; placement: number | null };
type TournamentLite = { id: string; name: string; format: string };

const total = (scores: Record<string, number> | null | undefined, criteria: string[]) =>
  criteria.reduce((s, c) => s + (Number(scores?.[c]) || 0), 0);

// Full-screen self-judging carousel: one entrant at a time, free numeric score
// per criterion, running total, then Finish → rank by total (highest = 1st).
export default function RunTournament({ tournament, criteria, entrants, onClose, onSaved, onWatch }: {
  tournament: TournamentLite; criteria: string[]; entrants: Entrant[]; onClose: () => void; onSaved: () => void; onWatch: (entrantId: string) => void;
}) {
  const supabase = createClient();
  const [ents, setEnts] = useState<Entrant[]>(entrants);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const cur = ents[i];

  const inp: React.CSSProperties = { padding: "9px 11px", borderRadius: 9, border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, fontSize: 15, width: 90, textAlign: "center" };
  const gold = { border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "11px 22px", fontSize: 15, background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` } as const;
  const ghost: React.CSSProperties = { border: `1px solid ${neutrals.border}`, background: "transparent", color: neutrals.text, borderRadius: 10, padding: "11px 20px", cursor: "pointer", fontSize: 15, fontWeight: 600 };

  function setScore(crit: string, val: string) {
    setEnts((list) => list.map((e, idx) => (idx === i ? { ...e, scores: { ...(e.scores || {}), [crit]: val === "" ? 0 : Number(val) } } : e)));
  }
  async function saveCurrent() {
    const s = cur.scores || {};
    await supabase.from("ih_entrants").update({ scores: s, score: total(s, criteria) }).eq("id", cur.id);
  }
  async function go(dir: 1 | -1) {
    setBusy(true); await saveCurrent(); setBusy(false);
    setI((n) => Math.min(ents.length - 1, Math.max(0, n + dir)));
  }
  async function finish() {
    setBusy(true);
    await saveCurrent();
    const ranked = [...ents].map((e) => ({ e, t: total(e.scores, criteria) })).sort((a, b) => b.t - a.t);
    for (let p = 0; p < ranked.length; p++) {
      await supabase.from("ih_entrants").update({ score: ranked[p].t, placement: p + 1, scores: ranked[p].e.scores || {} }).eq("id", ranked[p].e.id);
    }
    setBusy(false); setFinished(true); onSaved();
  }

  const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(6,6,8,0.94)", zIndex: 50, display: "flex", flexDirection: "column", padding: 24, overflowY: "auto" };

  if (finished) {
    const ranked = [...ents].map((e) => ({ e, t: total(e.scores, criteria) })).sort((a, b) => b.t - a.t);
    return (
      <div style={overlay}>
        <div style={{ maxWidth: 560, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: hues.gold.base }}>{tournament.name} · Final ranking</div>
          <div style={{ marginTop: 18 }}>
            {ranked.map((r, idx) => (
              <div key={r.e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${neutrals.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 26, textAlign: "center", fontWeight: 800, color: idx === 0 ? hues.gold.hi : idx === 1 ? "#C7CAD1" : idx === 2 ? "#C8894E" : neutrals.muted }}>{idx + 1}</span>
                  <span style={{ color: neutrals.text, fontWeight: 600 }}>{r.e.display_name}</span>
                </div>
                <span style={{ color: neutrals.muted, fontVariantNumeric: "tabular-nums" }}>{r.t}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ ...gold, marginTop: 24 }}>Done</button>
        </div>
      </div>
    );
  }

  if (!cur) {
    return (
      <div style={overlay}>
        <div style={{ margin: "auto", textAlign: "center", color: neutrals.muted }}>
          <p>No eligible entrants to score yet.</p>
          <button onClick={onClose} style={{ ...ghost, marginTop: 16 }}>Close</button>
        </div>
      </div>
    );
  }

  const runningTotal = total(cur.scores, criteria);
  return (
    <div style={overlay}>
      <div style={{ maxWidth: 560, margin: "0 auto", width: "100%" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 13, letterSpacing: 1.5, textTransform: "uppercase", color: hues.gold.base }}>{tournament.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: neutrals.muted, fontSize: 13 }}>Judging {i + 1} / {ents.length}</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: neutrals.muted2, cursor: "pointer", fontSize: 20 }}>✕</button>
          </div>
        </div>

        {/* progress */}
        <div style={{ height: 3, background: neutrals.border, borderRadius: 2, marginBottom: 22, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((i + 1) / ents.length) * 100}%`, background: hues.gold.base }} />
        </div>

        {/* entrant */}
        <div style={{ fontSize: 26, fontWeight: 700, color: neutrals.text }}>{cur.display_name}</div>
        <div style={{ color: neutrals.muted, fontSize: 14, marginTop: 4 }}>{[cur.event, cur.division].filter(Boolean).join(" · ") || "—"}</div>
        {tournament.format === "video" && (
          cur.video_url
            ? <button onClick={() => onWatch(cur.id)} style={{ display: "inline-block", marginTop: 14, color: hues.gold.hi, fontSize: 14, background: "none", cursor: "pointer", border: `1px solid ${neutrals.border}`, borderRadius: 9, padding: "8px 14px" }}>▶ Watch entry video ↗</button>
            : <div style={{ marginTop: 14, color: neutrals.muted2, fontSize: 13 }}>No video submitted.</div>
        )}

        {/* criteria */}
        <div style={{ marginTop: 26 }}>
          {criteria.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${neutrals.border}` }}>
              <span style={{ color: neutrals.text, fontSize: 15 }}>{c}</span>
              <input style={inp} type="number" inputMode="decimal" placeholder="—"
                value={cur.scores?.[c] ?? ""} onChange={(e) => setScore(c, e.target.value)} />
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0" }}>
            <span style={{ color: neutrals.muted2, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>Total</span>
            <span style={{ color: hues.gold.hi, fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{runningTotal}</span>
          </div>
        </div>

        {/* nav */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => go(-1)} disabled={i === 0 || busy} style={{ ...ghost, opacity: i === 0 ? 0.4 : 1 }}>← Back</button>
          {i < ents.length - 1
            ? <button onClick={() => go(1)} disabled={busy} style={{ ...gold, marginLeft: "auto" }}>{busy ? "Saving…" : "Next →"}</button>
            : <button onClick={finish} disabled={busy} style={{ ...gold, marginLeft: "auto" }}>{busy ? "Ranking…" : "Finish & rank"}</button>}
        </div>
      </div>
    </div>
  );
}
