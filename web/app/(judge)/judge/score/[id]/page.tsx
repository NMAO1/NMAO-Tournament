"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";

type Entry = { event: string; age_bracket: string; declared_rank: string; video_url: string | null; video_url_2: string | null };
type Assignment = { id: string; entry_id: string; state: string; score: number | null; entry: Entry | null };
type Criterion = { code: string; name: string; description: string; sort_order: number; weight_pct: number };
type Style = "traditional" | "open";

const styleFromEvent = (event: string): Style => (event.startsWith("open") ? "open" : "traditional");
const prettyEvent = (e: string) => e.replace(/^open_/, "Open · ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const SHORT: Record<string, string> = {
  technical: "Technical", power: "Power & Focus", balance: "Balance",
  timing: "Timing", spirit: "Spirit", difficulty: "Difficulty",
};
const entryOf = (a: { entry: Entry | Entry[] | null }): Entry | null => (Array.isArray(a.entry) ? a.entry[0] : a.entry) ?? null;

// Mirrors _shared/rating.ts weightedJudgeScore — live preview only; the EF is authoritative.
function weighted(vals: Record<string, number>, crit: Criterion[]): number {
  let w = 0, sum = 0;
  for (const c of crit) {
    const v = vals[c.code];
    if (v == null) continue;
    w += v * c.weight_pct; sum += c.weight_pct;
  }
  const denom = sum > 0 ? sum : 100;
  return Math.max(0, Math.min(100, Math.round((w / denom) * 100) / 100));
}

export default function ScoreCarousel() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [criteriaByStyle, setCriteriaByStyle] = useState<Record<Style, Criterion[]>>({ traditional: [], open: [] });
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({}); // entry_id -> code -> value
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string>(""); // entry_id just submitted (for the ✓ pulse)
  const [playback, setPlayback] = useState<Record<string, { a1: string | null; a2: string | null }>>({}); // entry_id -> signed URLs
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace("/login"); return; }
    const uid = sess.session.user.id;

    const { data: judge } = await supabase.from("judges").select("id").eq("auth_user_id", uid).maybeSingle();
    if (!judge) { setErr("This account isn't registered as a judge."); setLoading(false); return; }
    const judgeId = (judge as { id: string }).id;

    const [{ data: asn, error: aerr }, { data: crit }, { data: wTrad }, { data: wOpen }, { data: priors }] = await Promise.all([
      supabase.from("judge_assignments")
        .select("id, entry_id, state, score, entries(event, age_bracket, declared_rank, video_url, video_url_2)")
        .eq("judge_id", judgeId).order("state", { ascending: true }),
      supabase.from("criteria").select("code, name, description, sort_order"),
      supabase.from("rubric_weights").select("criterion_code, weight_pct").eq("style", "traditional"),
      supabase.from("rubric_weights").select("criterion_code, weight_pct").eq("style", "open"),
      supabase.from("submission_scores").select("entry_id, criterion_code, raw_score").eq("judge_id", judgeId),
    ]);
    if (aerr) { setErr(aerr.message); setLoading(false); return; }

    const rows: Assignment[] = ((asn ?? []) as unknown as { id: string; entry_id: string; state: string; score: number | null; entries: Entry | Entry[] | null }[])
      .map((r) => ({ id: r.id, entry_id: r.entry_id, state: r.state, score: r.score, entry: entryOf({ entry: r.entries }) }));

    const critRows = (crit ?? []) as { code: string; name: string; description: string; sort_order: number }[];
    const build = (weights: { criterion_code: string; weight_pct: number }[] | null): Criterion[] => {
      const m = new Map((weights ?? []).map((w) => [w.criterion_code, Number(w.weight_pct)]));
      return critRows.filter((c) => m.has(c.code)).map((c) => ({ ...c, weight_pct: m.get(c.code)! })).sort((a, b) => a.sort_order - b.sort_order);
    };
    const seed: Record<string, Record<string, number>> = {};
    for (const p of (priors ?? []) as { entry_id: string; criterion_code: string; raw_score: number }[]) {
      (seed[p.entry_id] ||= {})[p.criterion_code] = Number(p.raw_score);
    }

    const start = Math.max(0, rows.findIndex((r) => r.id === id));
    setAssignments(rows);
    setCriteriaByStyle({ traditional: build(wTrad), open: build(wOpen) });
    setScores(seed);
    setIdx(start === -1 ? 0 : start);
    setLoading(false);
  }, [supabase, router, id]);

  useEffect(() => { load(); }, [load]);

  const cur = assignments[idx];
  const curEntry = cur?.entry ?? null;
  const pb = cur ? playback[cur.entry_id] : undefined;
  const style: Style = curEntry ? styleFromEvent(curEntry.event) : "traditional";
  const criteria = criteriaByStyle[style];
  const vals = (cur && scores[cur.entry_id]) || {};
  const allScored = criteria.length > 0 && criteria.every((c) => vals[c.code] != null);
  const preview = useMemo(() => weighted(vals, criteria), [vals, criteria]);
  const submittedCount = assignments.filter((a) => a.state === "submitted").length;

  const go = useCallback((delta: number) => {
    setIdx((i) => {
      const n = Math.max(0, Math.min(assignments.length - 1, i + delta));
      if (n !== i) {
        setDir(delta > 0 ? "next" : "prev");
        if (typeof window !== "undefined") window.history.replaceState(null, "", `/judge/score/${assignments[n].id}`);
      }
      return n;
    });
  }, [assignments]);

  // keyboard: ←/→ navigate when not typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Private videos are storage paths — mint short-lived signed URLs for the
  // current entry via the get-playback-url seam (also where sponsor pre-roll lands).
  useEffect(() => {
    if (!cur || playback[cur.entry_id]) return;
    const eid = cur.entry_id;
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-playback-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session?.access_token}` },
          body: JSON.stringify({ entry_id: eid }),
        });
        const j = await res.json();
        if (!cancelled && res.ok && j.ok) setPlayback((p) => ({ ...p, [eid]: { a1: j.angle1 ?? null, a2: j.angle2 ?? null } }));
      } catch { /* leave unset — the UI shows a fallback */ }
    })();
    return () => { cancelled = true; };
  }, [cur, playback, supabase]);

  function setScore(code: string, raw: string) {
    if (!cur) return;
    setScores((s) => {
      const e = { ...(s[cur.entry_id] || {}) };
      if (raw === "") delete e[code];
      else e[code] = Math.max(0, Math.min(100, Math.round(Number(raw))));
      return { ...s, [cur.entry_id]: e };
    });
  }

  async function submit() {
    if (!cur || !allScored) return;
    setSaving(true); setErr("");
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      const res = await fetch(`${base}/functions/v1/submit-judge-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anon!, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entry_id: cur.entry_id, scores: criteria.map((c) => ({ criterion_code: c.code, raw_score: vals[c.code] })) }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "Submission failed."); setSaving(false); return; }
      const entryId = cur.entry_id;
      setAssignments((list) => list.map((a) => (a.id === cur.id ? { ...a, state: "submitted", score: j.score } : a)));
      setFlash(entryId);
      setSaving(false);
      // auto-advance to the next competitor (judge can swipe back if needed)
      setTimeout(() => {
        setFlash((f) => (f === entryId ? "" : f));
        setIdx((i) => {
          const n = i + 1;
          if (n < assignments.length) { setDir("next"); window.history.replaceState(null, "", `/judge/score/${assignments[n].id}`); return n; }
          return i;
        });
      }, 750);
    } catch {
      setErr("Network error — please retry.");
      setSaving(false);
    }
  }

  if (loading) return <Shell><p style={{ color: neutrals.muted }}>Loading your queue…</p></Shell>;
  if (err && !cur) return <Shell><p style={{ color: status.danger }}>{err}</p><Back router={router} /></Shell>;
  if (!cur) return <Shell><p style={{ color: neutrals.muted }}>No assignments in your queue.</p><Back router={router} /></Shell>;

  const isSubmitted = cur.state === "submitted";
  const justFlashed = flash === cur.entry_id;

  return (
    <Shell>
      <style>{`input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield}
        @keyframes slideNext{from{opacity:0;transform:translateX(46px)}to{opacity:1;transform:none}}
        @keyframes slidePrev{from{opacity:0;transform:translateX(-46px)}to{opacity:1;transform:none}}`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Back router={router} />
        <div style={{ fontSize: 12, color: neutrals.muted }}>
          Entry <strong style={{ color: neutrals.text }}>{idx + 1}</strong> of {assignments.length}
          <span style={{ color: neutrals.muted2 }}> · {submittedCount} scored</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <Arrow dir="prev" onClick={() => go(-1)} disabled={idx === 0} />

        <div key={cur.id} style={{ flex: 1, minWidth: 0, animation: `${dir === "next" ? "slideNext" : "slidePrev"} .28s ease` }}>
          {curEntry && (
            <>
              <div style={{ position: "sticky", top: 8, zIndex: 5, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                {[
                  { url: pb?.a1 ?? null, label: "Angle 1", missing: "No video for this entry." },
                  { url: pb?.a2 ?? null, label: "Angle 2", missing: "Second angle not submitted." },
                ].map((a, k) => (
                  <div key={k} style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${neutrals.border}`, background: "#000", boxShadow: "0 10px 30px rgba(0,0,0,0.55)" }}>
                    <span style={{ position: "absolute", top: 8, left: 8, zIndex: 2, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: neutrals.text, background: "rgba(0,0,0,0.55)", padding: "3px 8px", borderRadius: 999 }}>{a.label}</span>
                    {a.url ? (
                      <video key={a.url} src={a.url} controls playsInline style={{ width: "100%", display: "block", aspectRatio: "16 / 10", objectFit: "contain", background: "#000", maxHeight: 460 }} />
                    ) : (
                      <div style={{ aspectRatio: "16 / 10", display: "flex", alignItems: "center", justifyContent: "center", color: neutrals.muted2, fontSize: 13, padding: 16, textAlign: "center" }}>{pb === undefined ? "Loading video…" : a.missing}</div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "14px 0 4px" }}>
                <h1 style={{ fontFamily: "Georgia, serif", fontSize: 21, margin: 0 }}>{prettyEvent(curEntry.event)}</h1>
                <span style={{ fontSize: 12, color: neutrals.muted2, textTransform: "capitalize" }}>{style}</span>
              </div>
              <div style={{ color: neutrals.muted, fontSize: 13, marginBottom: 12 }}>
                {curEntry.age_bracket} · {curEntry.declared_rank}
                {isSubmitted && <span style={{ color: status.success, marginLeft: 8 }}>· submitted {cur.score?.toFixed(1)}</span>}
              </div>

              <p style={{ fontSize: 12, color: neutrals.muted2, margin: "0 0 12px" }}>
                Enter 0–100 per criterion. <strong style={{ color: neutrals.muted }}>Tab/Enter</strong> moves to the next field; <strong style={{ color: neutrals.muted }}>← →</strong> flips competitors.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
                {criteria.map((c, i) => {
                  const scored = vals[c.code] != null;
                  return (
                    <div key={c.code} title={`${c.name} — ${c.description}`}
                      style={{ background: neutrals.surface, border: `1px solid ${scored ? hues.gold.base : neutrals.border}`, borderRadius: 11, padding: "9px 8px 8px", transition: "border-color .15s", minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 7 }}>{SHORT[c.code] ?? c.name}</div>
                      <input
                        ref={(el) => { inputsRef.current[i] = el; }}
                        type="number" min={0} max={100} inputMode="numeric" autoFocus={i === 0}
                        value={vals[c.code] ?? ""} placeholder="—"
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); inputsRef.current[i + 1]?.focus(); } }}
                        onChange={(ev) => setScore(c.code, ev.target.value)}
                        style={{ width: "100%", padding: "8px 2px", fontSize: 22, fontWeight: 800, textAlign: "center", color: hues.gold.hi, background: "#0e0e11", border: `1px solid ${neutrals.border}`, borderRadius: 8 }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: hues.sapphire.hi, letterSpacing: 0.3 }}>0–100</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: hues.gold.hi }}>{c.weight_pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <Arrow dir="next" onClick={() => go(1)} disabled={idx === assignments.length - 1} />
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "rgba(8,8,8,0.92)", backdropFilter: "blur(10px)", borderTop: `1px solid ${neutrals.border}`, marginTop: 16, padding: "14px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: neutrals.muted2 }}>Weighted</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: hues.gold.hi }}>{allScored ? preview.toFixed(1) : "—"}</div>
        </div>
        <button onClick={submit} disabled={!allScored || saving}
          style={{ flex: 1, maxWidth: 260, border: "none", cursor: allScored ? "pointer" : "not-allowed", fontWeight: 700, borderRadius: 12, padding: "14px 20px",
            background: justFlashed ? `linear-gradient(160deg, ${status.success}, #3f7a52)` : allScored ? `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` : neutrals.surface2,
            color: justFlashed ? "#fff" : allScored ? "#141210" : neutrals.muted2, opacity: saving ? 0.6 : 1 }}>
          {justFlashed ? "✓ Submitted" : saving ? "Submitting…" : isSubmitted ? "Update Score" : allScored ? "Submit Score" : `Score all ${criteria.length}`}
        </button>
      </div>
      {err && <p style={{ color: status.danger, fontSize: 13, marginTop: 10 }}>{err}</p>}
    </Shell>
  );
}

function Arrow({ dir, onClick, disabled }: { dir: "next" | "prev"; onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={dir === "next" ? "Next entry" : "Previous entry"}
      style={{ flex: "0 0 auto", width: 46, alignSelf: "stretch", display: "flex", justifyContent: "center", background: "none", border: "none", padding: 0, cursor: disabled ? "default" : "pointer", color: neutrals.text, opacity: disabled ? 0.2 : 1 }}>
      <span style={{ position: "sticky", top: "44vh", height: "fit-content", fontSize: 44, lineHeight: 1, fontWeight: 300 }}>{dir === "next" ? "›" : "‹"}</span>
    </button>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 12px 40px" }}>
        <div style={{ height: 3, width: 96, borderRadius: 99, background: spectrum, marginBottom: 12 }} />
        {children}
      </div>
    </main>
  );
}
function Back({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <button onClick={() => router.push("/judge")}
      style={{ background: "none", border: "none", color: neutrals.muted, cursor: "pointer", fontSize: 13, padding: "2px 0" }}>
      ← Queue
    </button>
  );
}
