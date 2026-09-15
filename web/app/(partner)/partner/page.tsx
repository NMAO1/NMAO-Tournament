"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";

type Summary = {
  partner: { id: string; name: string; slug: string; tier: string; status: string; payouts_enabled: boolean };
  referral_links: { member: string; tournament: string };
  counts: { schools_active: number; schools_total: number; competitors_referred: number; entries_total: number };
  schools: { name: string; active: boolean; attributed_at: string; entries: number; competitors: number }[];
};

const TIER_LABEL: Record<string, string> = { ambassador: "Ambassador", regional_director: "Regional Director", founding: "Founding" };

export default function PartnerDashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrReady, setQrReady] = useState(false);
  const qrBox = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace("/partner/login"); return; }
    const { data: sum, error } = await supabase.rpc("partner_portal_summary");
    if (error) { setErr(error.message); setLoading(false); return; }
    if (!sum) { setErr("This account isn't linked to an ambassador. Contact NMAO."); setLoading(false); return; }
    setData(sum as Summary);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  const refLink = data?.referral_links.member || "";

  // Render the QR once the library is ready and we have the referral link.
  useEffect(() => {
    const QR = (window as unknown as { QRCode?: any }).QRCode;
    if (!qrReady || !refLink || !qrBox.current || !QR) return;
    qrBox.current.innerHTML = "";
    // eslint-disable-next-line no-new
    new QR(qrBox.current, { text: refLink, width: 176, height: 176, colorDark: "#141210", colorLight: "#ffffff", correctLevel: QR.CorrectLevel.M });
    // qrcodejs injects a 176px <canvas> (+ an <img>); scale both to the 88px slot.
    qrBox.current.querySelectorAll("canvas, img").forEach((el) => {
      (el as HTMLElement).style.width = "88px";
      (el as HTMLElement).style.height = "88px";
    });
  }, [qrReady, refLink]);

  function makeQRCanvas(size: number): HTMLCanvasElement | null {
    const QR = (window as unknown as { QRCode?: any }).QRCode;
    if (!QR || !refLink) return null;
    const tmp = document.createElement("div");
    // eslint-disable-next-line no-new
    new QR(tmp, { text: refLink, width: size, height: size, colorDark: "#141210", colorLight: "#ffffff", correctLevel: QR.CorrectLevel.M });
    return tmp.querySelector("canvas");
  }
  function downloadQR(fmt: "png" | "jpeg") {
    const q = makeQRCanvas(560);
    if (!q) return;
    const m = 48, c = document.createElement("canvas");
    c.width = c.height = 560 + m * 2;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(q, m, m);
    const a = document.createElement("a");
    a.href = c.toDataURL(fmt === "jpeg" ? "image/jpeg" : "image/png", 0.95);
    a.download = `NMAO-referral-QR-${data?.partner.slug || "link"}.${fmt === "jpeg" ? "jpg" : "png"}`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(refLink); } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }
  async function signOut() { await supabase.auth.signOut(); router.replace("/partner/login"); }

  if (loading) return <Center>Loading your dashboard…</Center>;
  if (err) return <Center><div style={{ textAlign: "center" }}><p style={{ color: status.danger, marginBottom: 14 }}>{err}</p><button onClick={signOut} style={ghostBtn}>Sign out</button></div></Center>;
  if (!data) return null;

  const c = data.counts;
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif" }}>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" strategy="afterInteractive" onLoad={() => setQrReady(true)} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <div style={{ height: 4, width: 120, borderRadius: 99, background: spectrum, marginBottom: 12 }} />
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, margin: 0 }}>Welcome back, {data.partner.name.split(" ")[0]}</h1>
            <p style={{ color: neutrals.muted, fontSize: 13, margin: "4px 0 0" }}>Your NMAO ambassador dashboard.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: neutrals.muted, border: `1px solid ${neutrals.border}`, borderRadius: 99, padding: "7px 13px" }}>
              Tier <b style={{ color: hues.gold.base }}>{TIER_LABEL[data.partner.tier] || data.partner.tier}</b>
            </span>
            <button onClick={signOut} style={ghostBtn}>Sign out</button>
          </div>
        </div>

        {/* Referral link + QR */}
        <div style={{ border: `1px solid ${neutrals.border}`, borderRadius: 16, padding: 18, marginBottom: 18, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", background: "#0e0e11" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9 }}>
            <div style={{ width: 104, height: 104, background: "#fff", borderRadius: 12, display: "grid", placeItems: "center" }}>
              <div ref={qrBox} style={{ width: 88, height: 88 }} />
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              <button onClick={() => downloadQR("png")} style={miniBtn}>↓ PNG</button>
              <button onClick={() => downloadQR("jpeg")} style={miniBtn}>↓ JPEG</button>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: hues.gold.base, fontWeight: 800, textTransform: "uppercase" }}>Your school sign-up link &amp; QR</div>
            <div style={{ display: "flex", gap: 10, marginTop: 9, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200, background: neutrals.bg, border: `1px solid ${neutrals.border}`, borderRadius: 10, padding: "11px 14px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{refLink}</div>
              <button onClick={copyLink} style={{ ...primaryBtn, padding: "0 18px" }}>{copied ? "Copied ✓" : "Copy"}</button>
            </div>
            <div style={{ fontSize: 12, color: neutrals.muted, marginTop: 9, lineHeight: 1.5 }}>Send this to a school. When they sign up, they&apos;re credited to you — and you earn on their platform fee <b style={{ color: neutrals.text }}>plus $1 for every tournament entry their students make</b>.</div>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 18 }}>
          <Tile accent={hues.gold.base} k="Schools referred" v={String(c.schools_active)} d={`${c.schools_total} total · ${c.schools_active} active`} />
          <Tile accent="#4C97DE" k="Competitors" v={String(c.competitors_referred)} d="Competing under your schools" />
          <Tile accent="#37C87A" k="Entries" v={String(c.entries_total)} d="Paid entries · $1 each to you" />
          <Tile accent="transparent" k="Earnings" v="—" d="Shown once payouts & tax onboarding go live" preview />
        </div>

        {/* Referrals table */}
        <div style={{ border: `1px solid ${neutrals.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", borderBottom: `1px solid ${neutrals.border}` }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>My referred schools</h3>
            <span style={{ color: neutrals.muted, fontSize: 12 }}>Newest first</span>
          </div>
          {data.schools.length === 0 ? (
            <div style={{ padding: 22, color: neutrals.muted, fontSize: 13.5 }}>No schools credited to you yet. Share your referral link to get started.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 460 }}>
                <thead><tr>
                  <th style={th}>School</th>
                  <th style={{ ...th, textAlign: "right" }}>Entries</th>
                  <th style={{ ...th, textAlign: "right" }}>Competitors</th>
                  <th style={th}>Attributed</th>
                  <th style={th}>Status</th>
                </tr></thead>
                <tbody>
                  {data.schools.map((s, i) => (
                    <tr key={i}>
                      <td style={td}><b>{s.name}</b></td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.entries}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: neutrals.muted }}>{s.competitors}</td>
                      <td style={{ ...td, color: neutrals.muted }}>{new Date(s.attributed_at).toLocaleDateString()}</td>
                      <td style={td}><Tag active={s.active} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick links */}
        <h3 style={{ fontSize: 15, margin: "26px 0 10px" }}>Quick links</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <QuickLink u="join.nmao.us" w="Schools — free signup + info" href="https://join.nmao.us" />
          <QuickLink u="league.nmao.us" w="Competitors — where athletes start" href="https://league.nmao.us" />
          <QuickLink u={data.referral_links.tournament.replace(/^https?:\/\//, "")} w="Your competitor referral link" href={data.referral_links.tournament} />
        </div>

        <h3 style={{ fontSize: 15, margin: "26px 0 10px" }}>Earnings calculator</h3>
        <EarningsCalc />
      </div>
    </main>
  );
}

function EarningsCalc() {
  const [schools, setSchools] = useState(5);
  const [rev, setRev] = useState(20000);
  const [comp, setComp] = useState(40);
  const [entries, setEntries] = useState(3);
  const perSchool = Math.min(rev * 0.001, 20);          // 10% of the school's 1% fee, capped at $20
  const platformMo = schools * perSchool;
  const entriesMo = comp * entries;                     // $1 each
  const totalMo = platformMo + entriesMo;
  const money = (n: number) => "$" + Math.round(n).toLocaleString();

  const row = (label: string, val: string, min: number, max: number, step: number, v: number, set: (n: number) => void) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: neutrals.muted }}>{label}</span><span style={{ fontWeight: 700 }}>{val}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))}
        style={{ width: "100%", accentColor: hues.gold.base }} />
    </div>
  );

  return (
    <div style={{ border: `1px solid ${neutrals.border}`, borderRadius: 16, padding: 18, background: "#0e0e11", display: "grid", gridTemplateColumns: "minmax(240px, 1fr) minmax(200px, 260px)", gap: 22 }}>
      <div>
        {row("Schools referred", String(schools), 0, 50, 1, schools, setSchools)}
        {row("Avg monthly revenue / school", money(rev), 0, 30000, 1000, rev, setRev)}
        <div style={{ fontSize: 11.5, color: neutrals.muted, margin: "-8px 0 14px" }}>→ {money(perSchool)}/school (10% of their 1% platform fee, capped at $20)</div>
        {row("Active competitors", String(comp), 0, 500, 5, comp, setComp)}
        {row("Entries / competitor / month", String(entries), 0, 12, 1, entries, setEntries)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center", borderLeft: `1px solid ${neutrals.border}`, paddingLeft: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: neutrals.muted }}>Platform</span><span style={{ fontWeight: 700 }}>{money(platformMo)}/mo</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: neutrals.muted }}>Entries ($1 each)</span><span style={{ fontWeight: 700 }}>{money(entriesMo)}/mo</span></div>
        <div style={{ height: 1, background: neutrals.border }} />
        <div>
          <div style={{ fontSize: 12, color: neutrals.muted }}>Projected total</div>
          <div style={{ fontSize: 34, lineHeight: 1, color: hues.gold.base, fontWeight: 800, fontFamily: "Georgia, serif" }}>{money(totalMo)}<span style={{ fontSize: 15, color: neutrals.muted, fontWeight: 400 }}>/mo</span></div>
          <div style={{ fontSize: 13, color: neutrals.text, marginTop: 3 }}>{money(totalMo * 12)}<span style={{ color: neutrals.muted }}> / year</span></div>
        </div>
        <div style={{ fontSize: 10.5, color: neutrals.muted, lineHeight: 1.4 }}>Estimate only — for planning, not a guarantee of earnings.</div>
      </div>
    </div>
  );
}

/* ---- small presentational helpers ---- */
const primaryBtn: React.CSSProperties = { border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` };
const ghostBtn: React.CSSProperties = { border: `1px solid ${neutrals.border}`, background: "none", color: neutrals.text, cursor: "pointer", fontWeight: 600, borderRadius: 10, padding: "8px 14px", fontSize: 13 };
const miniBtn: React.CSSProperties = { border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, cursor: "pointer", fontWeight: 700, borderRadius: 8, padding: "6px 11px", fontSize: 11 };
const th: React.CSSProperties = { textAlign: "left", color: neutrals.muted, fontWeight: 600, fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase", padding: "11px 18px", background: "rgba(255,255,255,.03)" };
const td: React.CSSProperties = { padding: "13px 18px", borderTop: `1px solid ${neutrals.border}` };

function Center({ children }: { children: React.ReactNode }) {
  return <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "Inter, system-ui, sans-serif" }}>{children}</main>;
}
function Tile({ k, v, d, accent, preview }: { k: string; v: string; d: string; accent: string; preview?: boolean }) {
  return (
    <div style={{ border: `1px solid ${neutrals.border}`, borderTop: `3px solid ${accent === "transparent" ? hues.gold.base : accent}`, borderRadius: 14, padding: 17, background: "#0e0e11" }}>
      <div style={{ fontSize: 12, color: neutrals.muted }}>{k}{preview && <span style={{ fontSize: 9.5, letterSpacing: 1, fontWeight: 800, color: "#141210", background: hues.gold.base, borderRadius: 5, padding: "2px 6px", marginLeft: 6 }}>PREVIEW</span>}</div>
      <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6, lineHeight: 1 }}>{v}</div>
      <div style={{ fontSize: 12, color: neutrals.muted, marginTop: 8 }}>{d}</div>
    </div>
  );
}
function Tag({ active }: { active: boolean }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: active ? "rgba(55,180,120,.18)" : "rgba(157,176,204,.16)", color: active ? "#6fdca6" : "#b9c6dc" }}>{active ? "Active" : "Ended"}</span>;
}
function QuickLink({ u, w, href }: { u: string; w: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, border: `1px solid ${neutrals.border}`, borderRadius: 12, padding: "14px 16px", textDecoration: "none", background: "#0e0e11" }}>
      <div><div style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "#8fc0f2", fontSize: 13.5 }}>{u}</div><div style={{ fontSize: 12, color: neutrals.muted, marginTop: 2 }}>{w}</div></div>
      <span style={{ color: neutrals.muted, fontSize: 18 }}>↗</span>
    </a>
  );
}
