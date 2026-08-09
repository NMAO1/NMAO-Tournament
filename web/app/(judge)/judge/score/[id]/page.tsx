"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";

type Criterion = { code: string; name: string; description: string; sort_order: number; weight_pct: number };
const styleFromEvent = (event: string): "traditional" | "open" => (event.startsWith("open") ? "open" : "traditional");
const prettyEvent = (e: string) => e.replace(/^open_/, "Open · ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Mirrors _shared/rating.ts weightedJudgeScore — for the live preview only.
// The authoritative score is computed server-side by submit-judge-scores.
function weighted(scores: Record<string, number>, crit: Criterion[]): number {
  let w = 0, sum = 0;
  for (const c of crit) {
    const v = scores[c.code];
    if (v == null) continue;
    w += v * c.weight_pct; sum += c.weight_pct;
  }
  const denom = sum > 0 ? sum : 100;
  return Math.max(0, Math.min(100, Math.round((w / denom) * 100) / 100));
}

export default function ScoreScreen() {
  const supabase = createClient();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [entryId, setEntryId] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ event: string; age_bracket: string; declared_rank: string; video_url: string | null } | null>(null);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace("/login"); return; }

    const { data: a, error: aerr } = await supabase
      .from("judge_assignments").select("id, entry_id, judge_id, score, state").eq("id", id).maybeSingle();
    if (aerr || !a) { setErr("Assignment not found or not yours."); setLoading(false); return; }
    const asn = a as { entry_id: string; judge_id: string };
    setEntryId(asn.entry_id);

    const { data: e } = await supabase
      .from("entries").select("event, age_bracket, declared_rank, video_url").eq("id", asn.entry_id).maybeSingle();
    if (!e) { setErr("Entry not found."); setLoading(false); return; }
    const entry = e as { event: string; age_bracket: string; declared_rank: string; video_url: string | null };
    setMeta(entry);

    const style = styleFromEvent(entry.event);
    const [{ data: crit }, { data: weights }, { data: prior }] = await Promise.all([
      supabase.from("criteria").select("code, name, description, sort_order"),
      supabase.from("rubric_weights").select("criterion_code, weight_pct").eq("style", style),
      supabase.from("submission_scores").select("criterion_code, raw_score").eq("entry_id", asn.entry_id).eq("judge_id", asn.judge_id),
    ]);
    const wMap = new Map((weights ?? []).map((w: { criterion_code: string; weight_pct: number }) => [w.criterion_code, Number(w.weight_pct)]));
    const merged: Criterion[] = ((crit ?? []) as { code: string; name: string; description: string; sort_order: number }[])
      .filter((c) => wMap.has(c.code))
      .map((c) => ({ ...c, weight_pct: wMap.get(c.code)! }))
      .sort((x, y) => x.sort_order - y.sort_order);
    setCriteria(merged);
    if (prior?.length) {
      const pre: Record<string, number> = {};
      for (const p of prior as { criterion_code: string; raw_score: number }[]) pre[p.criterion_code] = Number(p.raw_score);
      setScores(pre);
    }
    setLoading(false);
  }, [supabase, router, id]);

  useEffect(() => { load(); }, [load]);

  const allScored = criteria.length > 0 && criteria.every((c) => scores[c.code] != null);
  const preview = useMemo(() => weighted(scores, criteria), [scores, criteria]);

  async function submit() {
    if (!allScored || !entryId) return;
    setSaving(true); setErr("");
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      const res = await fetch(`${base}/functions/v1/submit-judge-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anon!, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entry_id: entryId, scores: criteria.map((c) => ({ criterion_code: c.code, raw_score: scores[c.code] })) }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "Submission failed."); setSaving(false); return; }
      setDone(j.score);
    } catch {
      setErr("Network error — please retry.");
    }
    setSaving(false);
  }

  if (loading) return <Shell><p style={{ color: neutrals.muted }}>Loading…</p></Shell>;
  if (err && !meta) return <Shell><p style={{ color: status.danger }}>{err}</p><Back router={router} /></Shell>;

  if (done != null) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", color: neutrals.muted2 }}>Score submitted</div>
          <div style={{ fontSize: 64, fontWeight: 800, color: hues.gold.hi, margin: "8px 0", textShadow: `0 0 26px ${hues.gold.shadow}` }}>{done.toFixed(1)}</div>
          <p style={{ color: neutrals.muted, fontSize: 14 }}>Recorded to the round. You can revise it any time before results finalize.</p>
          <button onClick={() => router.push("/judge")}
            style={{ marginTop: 18, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 11, padding: "12px 26px",
              background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` }}>
            Back to queue
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Back router={router} />
      {meta && (
        <>
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 24, margin: "6px 0 2px" }}>{prettyEvent(meta.event)}</h1>
          <div style={{ color: neutrals.muted, fontSize: 13, marginBottom: 16 }}>{meta.age_bracket} · {meta.declared_rank}</div>

          <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${neutrals.border}`, background: "#000", marginBottom: 22 }}>
            {meta.video_url ? (
              <video src={meta.video_url} controls playsInline style={{ width: "100%", display: "block", maxHeight: 420 }} />
            ) : (
              <div style={{ padding: "48px 20px", textAlign: "center", color: neutrals.muted2 }}>Video not yet available for this entry.</div>
            )}
          </div>

          {criteria.map((c) => (
            <div key={c.code} style={{ marginBottom: 16, background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
                <span title="rubric weight for this style" style={{ fontSize: 11, fontWeight: 700, color: neutrals.muted, background: neutrals.surface2, border: `1px solid ${neutrals.border}`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>
                  {c.weight_pct}%
                </span>
              </div>
              <div style={{ fontSize: 12, color: neutrals.muted2, margin: "5px 0 12px", lineHeight: 1.45 }}>{c.description}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <input type="number" min={0} max={100} inputMode="numeric" value={scores[c.code] ?? ""} placeholder="0–100"
                  onChange={(ev) => {
                    const raw = ev.target.value;
                    setScores((s) => {
                      const next = { ...s };
                      if (raw === "") delete next[c.code];
                      else next[c.code] = Math.max(0, Math.min(100, Math.round(Number(raw))));
                      return next;
                    });
                  }}
                  style={{ width: 84, padding: "10px 12px", fontSize: 18, fontWeight: 700, textAlign: "center", color: hues.gold.hi, background: "#0e0e11", border: `1px solid ${neutrals.border}`, borderRadius: 10 }} />
                <input type="range" min={0} max={100} step={1} value={scores[c.code] ?? 0}
                  onChange={(ev) => setScores((s) => ({ ...s, [c.code]: Number(ev.target.value) }))}
                  style={{ flex: 1, accentColor: hues.gold.base }} />
              </div>
            </div>
          ))}

          <div style={{ position: "sticky", bottom: 0, background: "rgba(8,8,8,0.92)", backdropFilter: "blur(10px)", borderTop: `1px solid ${neutrals.border}`, margin: "18px -16px 0", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: neutrals.muted2 }}>Weighted</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: hues.gold.hi }}>{allScored ? preview.toFixed(1) : "—"}</div>
            </div>
            <button onClick={submit} disabled={!allScored || saving}
              style={{ flex: 1, maxWidth: 240, border: "none", cursor: allScored ? "pointer" : "not-allowed", fontWeight: 700, color: "#141210", borderRadius: 12, padding: "14px 20px",
                background: allScored ? `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` : neutrals.surface2, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Submitting…" : allScored ? "Submit Score" : `Score all ${criteria.length} criteria`}
            </button>
          </div>
          {err && <p style={{ color: status.danger, fontSize: 13, marginTop: 10 }}>{err}</p>}
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "18px 16px 40px" }}>
        <div style={{ height: 3, width: 96, borderRadius: 99, background: spectrum, marginBottom: 14 }} />
        {children}
      </div>
    </main>
  );
}
function Back({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <button onClick={() => router.push("/judge")}
      style={{ background: "none", border: "none", color: neutrals.muted, cursor: "pointer", fontSize: 13, padding: "2px 0 8px" }}>
      ← Queue
    </button>
  );
}
