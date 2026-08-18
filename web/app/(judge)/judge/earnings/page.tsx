"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, hues, spectrum, status as st } from "@nmao/design-tokens";

type Pay = {
  id: string; round_id: string | null; videos_judged: number; rate_cents: number;
  amount_cents: number; currency: string; status: string; paid_at: string | null; created_at: string;
  rounds: { seq: number | null; name: string | null } | null;
};
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function JudgeEarnings() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Pay[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) { router.replace("/login"); return; }
      const { data } = await supabase
        .from("judge_payments")
        .select("id, round_id, videos_judged, rate_cents, amount_cents, currency, status, paid_at, created_at, rounds(seq, name)")
        .order("created_at", { ascending: false });
      setRows((data ?? []) as unknown as Pay[]);
    })();
  }, [supabase, router]);

  const total = (rows ?? []).reduce((s, r) => s + r.amount_cents, 0);
  const paid = (rows ?? []).filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_cents, 0);
  const pending = total - paid;
  const videos = (rows ?? []).reduce((s, r) => s + r.videos_judged, 0);

  const card: React.CSSProperties = { background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 14, padding: "16px 18px" };
  const chip = (s: string): React.CSSProperties => ({
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", padding: "3px 10px", borderRadius: 999,
    color: s === "paid" ? "#7ED0A0" : s === "failed" ? st.danger : hues.gold.hi,
    background: s === "paid" ? "rgba(90,154,106,0.14)" : s === "failed" ? "rgba(224,112,112,0.12)" : "rgba(230,185,63,0.12)",
    border: `1px solid ${s === "paid" ? "#3f7a52" : s === "failed" ? st.danger : hues.gold.shadow}`,
  });

  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif", padding: "28px 22px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={() => router.push("/judge")} style={{ background: "none", border: "none", color: neutrals.muted, cursor: "pointer", fontSize: 14 }}>‹ Judging pool</button>
          <div style={{ height: 3, width: 60, borderRadius: 99, background: spectrum }} />
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, margin: "0 0 4px" }}>Your earnings</h1>
        <p style={{ color: neutrals.muted2, fontSize: 13, margin: "0 0 20px" }}>Paid per video you score. Payouts land in your connected bank once you&apos;ve set up payouts.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={card}><div style={{ color: neutrals.muted, fontSize: 11 }}>Total earned</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 3 }}>{money(total)}</div></div>
          <div style={card}><div style={{ color: neutrals.muted, fontSize: 11 }}>Paid out</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 3, color: "#7ED0A0" }}>{money(paid)}</div></div>
          <div style={card}><div style={{ color: neutrals.muted, fontSize: 11 }}>Pending</div><div style={{ fontSize: 24, fontWeight: 700, marginTop: 3, color: hues.gold.hi }}>{money(pending)}</div></div>
        </div>
        <p style={{ color: neutrals.muted2, fontSize: 12, margin: "-12px 0 22px" }}>{videos} video{videos === 1 ? "" : "s"} scored across {rows?.length ?? 0} round{(rows?.length ?? 0) === 1 ? "" : "s"}.</p>

        {rows === null ? (
          <p style={{ color: neutrals.muted }}>Loading…</p>
        ) : rows.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: neutrals.muted2, padding: 30 }}>No earnings yet. Claim a pod and start scoring to earn.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{r.rounds?.name ?? (r.rounds?.seq != null ? `Round ${r.rounds.seq}` : "Round")}</div>
                  <div style={{ color: neutrals.muted, fontSize: 13, marginTop: 3 }}>{r.videos_judged} videos · {money(r.rate_cents)}/video{r.paid_at ? ` · paid ${new Date(r.paid_at).toLocaleDateString()}` : ""}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={chip(r.status)}>{r.status}</span>
                  <div style={{ fontSize: 17, fontWeight: 700, minWidth: 64, textAlign: "right" }}>{money(r.amount_cents)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
