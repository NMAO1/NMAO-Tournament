"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";
import JudgeOnboarding from "../JudgeOnboarding";

type Entry = { event: string; age_bracket: string; declared_rank: string; status: string; video_url: string | null };
type Assignment = {
  id: string; entry_id: string; state: string; score: number | null; submitted_at: string | null; role: string;
  entries: Entry | Entry[] | null;
};
type PoolPod = { pod_id: string; event: string; age_key: string; rank_key: string; entries: number; judge_count: number; seats_left: number };

const prettyEvent = (e: string) =>
  e.replace(/^open_/, "Open · ").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const entryOf = (a: Assignment): Entry | null => (Array.isArray(a.entries) ? a.entries[0] : a.entries) ?? null;

export default function JudgeQueue() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Assignment[]>([]);
  const [pool, setPool] = useState<PoolPod[]>([]);
  const judgeId = useRef<string | null>(null);
  const [judgeStatus, setJudgeStatus] = useState<string | null>(null);

  const efHeaders = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    return sess.session
      ? { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session.access_token}` }
      : null;
  }, [supabase]);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace("/login"); return; }
    if (!judgeId.current) {
      const { data: judge } = await supabase
        .from("judges").select("id, status, background_check_status")
        .eq("auth_user_id", sess.session.user.id).maybeSingle();
      if (!judge) { setErr("This account isn't registered as a judge."); setLoading(false); return; }
      judgeId.current = (judge as { id: string }).id;
      setJudgeStatus((judge as { status: string }).status);
    }
    const { data, error } = await supabase
      .from("judge_assignments")
      .select("id, entry_id, state, score, submitted_at, role, entries(event, age_bracket, declared_rank, status, video_url)")
      .eq("judge_id", judgeId.current)
      .order("state", { ascending: true });
    if (error) setErr(error.message);
    else setRows((data ?? []) as unknown as Assignment[]);
    setLoading(false);
  }, [supabase, router]);

  // The judging pool — pods I'm eligible to claim (computed server-side).
  const loadPool = useCallback(async () => {
    const headers = await efHeaders();
    if (!headers) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/available-pods`, { method: "POST", headers, body: "{}" });
      const j = await res.json();
      if (res.ok && j.ok) setPool((j.pods ?? []) as PoolPod[]);
    } catch { /* ignore */ }
  }, [efHeaders]);

  useEffect(() => {
    load(); loadPool();
    const ch = supabase
      .channel("judge-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "judge_assignments" }, () => { load(); loadPool(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, loadPool, supabase]);

  async function claim(podId: string) {
    const headers = await efHeaders();
    if (!headers) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/claim-pod`, { method: "POST", headers, body: JSON.stringify({ pod_id: podId }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) { alert(j.error || "Could not claim this pod."); loadPool(); return; }
    load(); loadPool();
  }

  async function recuse(entryId: string) {
    if (!confirm("Recuse from this entry? Your seat on this pod returns to the pool for another judge to claim.")) return;
    const headers = await efHeaders();
    if (!headers) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/recuse-assignment`, { method: "POST", headers, body: JSON.stringify({ entry_id: entryId }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) { alert(j.error || "Could not recuse."); return; }
    load(); loadPool();
  }

  // A judge who hasn't finished onboarding (not yet active) sees the checklist,
  // not the queue. Grandfathered/active judges go straight to judging.
  if (judgeStatus && judgeStatus !== "active") {
    return <JudgeOnboarding onActive={() => { setJudgeStatus("active"); load(); loadPool(); }} />;
  }

  const todo = rows.filter((r) => r.state === "assigned" || r.state === "reopened");
  const done = rows.filter((r) => r.state === "submitted");

  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif", padding: "0 0 60px" }}>
      <header style={{ position: "sticky", top: 0, background: "rgba(8,8,8,0.86)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${neutrals.border}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ height: 3, width: 96, borderRadius: 99, background: spectrum, marginBottom: 8 }} />
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: 22, margin: 0 }}>Judging Queue</h1>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}
          style={{ background: "none", border: `1px solid ${neutrals.border}`, color: neutrals.muted, borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 13 }}>
          Sign out
        </button>
      </header>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "22px 16px" }}>
        {loading && <p style={{ color: neutrals.muted }}>Loading your assignments…</p>}
        {err && <p style={{ color: status.danger }}>{err}</p>}

        {!loading && !err && (
          <>
            <SectionLabel n={pool.length} label="Available to judge" />
            {pool.length === 0 && <Empty text="No open pods to claim right now — new ones appear here in real time." />}
            {pool.map((p) => (
              <Card key={p.pod_id}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{prettyEvent(p.event)}</div>
                  <div style={{ color: neutrals.muted, fontSize: 13, marginTop: 3 }}>
                    {p.age_key.replace("_plus", "+").replace("_", "–")} · {p.rank_key} · {p.entries} entries · {p.seats_left} seat{p.seats_left > 1 ? "s" : ""} open
                  </div>
                </div>
                <button onClick={() => claim(p.pod_id)}
                  style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#fff", borderRadius: 10, padding: "10px 18px",
                    background: `linear-gradient(160deg, ${hues.sapphire.hi}, ${hues.sapphire.base} 55%, ${hues.sapphire.shadow})` }}>
                  Claim
                </button>
              </Card>
            ))}

            <div style={{ height: 26 }} />
            <SectionLabel n={todo.length} label="To score" />
            {todo.length === 0 && <Empty text="You're all caught up. New assignments appear here in real time." />}
            {todo.map((a) => {
              const e = entryOf(a);
              return (
                <Card key={a.id}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{e ? prettyEvent(e.event) : "Entry"}</div>
                    <div style={{ color: neutrals.muted, fontSize: 13, marginTop: 3 }}>
                      {e ? `${e.age_bracket} · ${e.declared_rank}` : ""}{a.state === "reopened" ? " · reopened" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => recuse(a.entry_id)}
                      style={{ background: "none", border: "none", color: neutrals.muted2, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                      Recuse
                    </button>
                    <button onClick={() => router.push(`/judge/score/${a.id}`)}
                      style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "10px 18px",
                        background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` }}>
                      Score
                    </button>
                  </div>
                </Card>
              );
            })}

            <div style={{ height: 26 }} />
            <SectionLabel n={done.length} label="Submitted" />
            {done.map((a) => {
              const e = entryOf(a);
              return (
                <Card key={a.id} dim>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{e ? prettyEvent(e.event) : "Entry"}</div>
                    <div style={{ color: neutrals.muted, fontSize: 13, marginTop: 3 }}>{e ? `${e.age_bracket} · ${e.declared_rank}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: hues.gold.hi }}>{a.score?.toFixed(1) ?? "—"}</div>
                    <button onClick={() => router.push(`/judge/score/${a.id}`)}
                      style={{ background: "none", border: "none", color: neutrals.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                      view / edit
                    </button>
                  </div>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}

function SectionLabel({ n, label }: { n: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 12px" }}>
      <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: neutrals.muted2 }}>{label}</span>
      <span style={{ fontSize: 12, color: neutrals.muted2 }}>({n})</span>
    </div>
  );
}
function Card({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 14, padding: "16px 18px", marginBottom: 10, opacity: dim ? 0.7 : 1 }}>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div style={{ color: neutrals.muted2, fontSize: 14, padding: "10px 2px 4px" }}>{text}</div>;
}
