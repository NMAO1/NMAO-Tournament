"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status } from "@nmao/design-tokens";
import InHouse from "./InHouse";

type Address = { line1?: string; city?: string; state?: string; postal?: string; country?: string };
type School = { id: string; name: string; contact_name: string | null; contact_email: string | null; phone: string | null; address: Address | null; logo_url: string | null; lat: number | null; lng: number | null; payout_tier: number | null };
type Athlete = { id: string; first_name: string; last_name: string; dob: string; declared_rank: string | null };
// Bridge-provisioned students from the membership roster, awaiting a rank + guardian redeem.
type Pending = { id: string; first_name: string; last_name: string; belt_name: string | null; declared_rank: string | null; dob: string | null; status: string };
type Settings = {
  competitor_id: string; allowed_events: string[] | null; dueling_enabled: boolean;
  competition_class: string | null; geo_exclude_miles: number | null; merch_enabled: boolean;
};
type Entry = { id: string; competitor_id: string; event: string; payment_status: string; video_url: string | null };
const RANKS = ["beginner", "intermediate", "advanced", "black_belt"];
const CLASSES = ["beginner", "intermediate", "advanced"];
const EVENTS = [
  { code: "trad_forms", name: "Trad Forms" }, { code: "trad_weapons", name: "Trad Weapons" },
  { code: "open_forms", name: "Open Forms" }, { code: "open_weapons", name: "Open Weapons" },
];
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "roster", label: "Roster", icon: "👥" },
  { key: "controls", label: "Tournament Controls", icon: "🎛️" },
  { key: "entries", label: "Entries & Payments", icon: "🧾" },
  { key: "inhouse", label: "In-house Tournaments", icon: "🏆" },
  { key: "payouts", label: "Payouts", icon: "💰" },
  { key: "settings", label: "Settings", icon: "⚙️" },
] as const;
type SectionKey = (typeof NAV)[number]["key"];
const cap = (r: string) => r.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const ageOf = (dob: string) => { const d = new Date(dob + "T00:00:00Z"); const n = new Date(); let a = n.getUTCFullYear() - d.getUTCFullYear(); const m = n.getUTCMonth() - d.getUTCMonth(); if (m < 0 || (m === 0 && n.getUTCDate() < d.getUTCDate())) a--; return a; };
const DEADLINE_KEYS = ["submission_deadline", "closes_at", "close_at", "collect_ends_at", "collect_until", "ends_at", "deadline"];
function pickDeadline(r: Record<string, unknown> | null): string | null {
  if (!r) return null;
  for (const k of DEADLINE_KEYS) { const v = r[k]; if (typeof v === "string" && v) return v; }
  return null;
}
function countdown(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "closed";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SchoolPortal() {
  const supabase = createClient();
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>("roster");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [school, setSchool] = useState<School | null>(null);
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [medals, setMedals] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<Record<string, Settings>>({});
  const [form, setForm] = useState({ first: "", last: "", dob: "", rank: "beginner" });
  const [saving, setSaving] = useState(false);
  const [selStudent, setSelStudent] = useState<string>("");
  const [profile, setProfile] = useState<School | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [connect, setConnect] = useState<{ connected: boolean; payouts_enabled: boolean; details_submitted: boolean } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryForm, setEntryForm] = useState({ competitor: "", event: "trad_forms" });
  const [entryFeeCents, setEntryFeeCents] = useState(4500);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(0);
  const [ctlSearch, setCtlSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [hintsOn, setHintsOn] = useState(true);
  const [drill, setDrill] = useState<null | "roster" | "entered" | "videos" | "income">(null);

  // Hints preference (per-browser) + a ticking clock for the submission countdown.
  useEffect(() => { setHintsOn(localStorage.getItem("nmao_hints") !== "off"); }, []);
  useEffect(() => { setNowTs(Date.now()); const t = setInterval(() => setNowTs(Date.now()), 30000); return () => clearInterval(t); }, []);
  function toggleHints(v: boolean) { setHintsOn(v); localStorage.setItem("nmao_hints", v ? "on" : "off"); }

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) { router.replace("/school/login"); return; }
    const { data: sch } = await supabase.from("schools").select("id, name, contact_name, contact_email, phone, address, logo_url, lat, lng, payout_tier").eq("auth_user_id", sess.session.user.id).maybeSingle();
    if (!sch) { setErr("This account isn't linked to a school."); setLoading(false); return; }
    setSchool(sch as School);
    setProfile(sch as School);

    // Projected-income inputs + the current round's submission deadline (best-effort; RLS/columns may vary).
    supabase.from("app_settings").select("value").eq("key", "entry_fee_cents").maybeSingle()
      .then(({ data }) => { const v = data ? Number((data as { value: unknown }).value) : NaN; if (!Number.isNaN(v)) setEntryFeeCents(v); });
    supabase.from("rounds").select("*").in("state", ["open", "collecting"]).order("opens_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setDeadline(pickDeadline(data as Record<string, unknown> | null)));

    const { data: comps } = await supabase.from("competitors")
      .select("id, first_name, last_name, dob, declared_rank").eq("school_id", (sch as School).id).order("last_name");
    const list = (comps ?? []) as Athlete[];
    setRoster(list);

    // Bridge-invited students (from the membership roster) still awaiting redeem.
    supabase.from("bridge_pending_athletes").select("id, first_name, last_name, belt_name, declared_rank, dob, status")
      .eq("school_id", (sch as School).id).eq("status", "pending").order("last_name")
      .then(({ data }) => setPending((data ?? []) as Pending[]));
    if (list.length && !selStudent) setSelStudent(list[0].id);
    setEntryForm((f) => (f.competitor ? f : { ...f, competitor: list[0]?.id ?? "" }));

    const ids = list.map((c) => c.id);
    if (ids.length) {
      const [{ data: sr }, { data: md }, { data: st }, { data: en }] = await Promise.all([
        supabase.from("skill_ratings").select("competitor_id, rating").in("competitor_id", ids),
        supabase.from("medals").select("competitor_id").in("competitor_id", ids),
        supabase.from("student_tournament_settings").select("competitor_id, allowed_events, dueling_enabled, competition_class, geo_exclude_miles, merch_enabled").in("competitor_id", ids),
        supabase.from("entries").select("id, competitor_id, event, payment_status, video_url").in("competitor_id", ids),
      ]);
      setEntries((en ?? []) as Entry[]);
      const rmap: Record<string, number> = {}; for (const r of (sr ?? []) as { competitor_id: string; rating: number }[]) rmap[r.competitor_id] = Number(r.rating); setRatings(rmap);
      const mmap: Record<string, number> = {}; for (const m of (md ?? []) as { competitor_id: string }[]) mmap[m.competitor_id] = (mmap[m.competitor_id] ?? 0) + 1; setMedals(mmap);
      const smap: Record<string, Settings> = {}; for (const s of (st ?? []) as Settings[]) smap[s.competitor_id] = s; setSettings(smap);
    }
    setLoading(false);
  }, [supabase, router, selStudent]);

  useEffect(() => { load(); }, [load]);

  // Load Stripe Connect status when the Payouts tab is opened (or returned to from Stripe).
  useEffect(() => {
    if (section !== "payouts" || !school) return;
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connect-status`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session?.access_token}` }, body: "{}",
        });
        const j = await res.json();
        if (!cancelled && j.ok) setConnect(j);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [section, school, supabase]);

  async function registerEntry() {
    if (!entryForm.competitor || !entryForm.event) return;
    setSaving(true); setErr(""); setSavedMsg("");
    const { data: sess } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/register-entry`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session?.access_token}` },
        body: JSON.stringify({ competitor_id: entryForm.competitor, event: entryForm.event }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || "Could not register."); setSaving(false); return; }
      setSavedMsg("Registered — the parent/guardian now pays in the app.");
    } catch { setErr("Network error."); }
    setSaving(false); load();
  }

  async function connectBank() {
    setSaving(true); setErr("");
    const { data: sess } = await supabase.auth.getSession();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connect-onboard`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session?.access_token}` },
        body: JSON.stringify({ return_url: location.origin + "/school" }),
      });
      const j = await res.json();
      if (j.ok && j.url) { window.location.href = j.url; return; }
      setErr(j.error || "Could not start bank setup."); setSaving(false);
    } catch { setErr("Network error."); setSaving(false); }
  }

  async function addAthlete() {
    if (!school || !form.first.trim() || !form.last.trim() || !form.dob) { setErr("Name and date of birth are required."); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.from("competitors").insert({ school_id: school.id, first_name: form.first.trim(), last_name: form.last.trim(), dob: form.dob, declared_rank: form.rank, status: "active" });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setForm({ first: "", last: "", dob: "", rank: "beginner" }); load();
  }
  async function importCompetitors() {
    if (!school) return;
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows: { school_id: string; first_name: string; last_name: string; dob: string; declared_rank: string; status: string }[] = [];
    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      let first = "", last = "", dob = "", rank = "beginner";
      if (parts.length >= 2) {
        first = parts[0]; last = parts[1]; dob = parts[2] || "";
        if (parts[3] && RANKS.includes(parts[3].toLowerCase())) rank = parts[3].toLowerCase();
      } else { const sp = line.split(/\s+/); first = sp[0] || ""; last = sp.slice(1).join(" "); }
      if (!first || !last) continue;
      rows.push({ school_id: school.id, first_name: first, last_name: last, dob: dob || "2000-01-01", declared_rank: rank, status: "active" });
    }
    if (!rows.length) { setErr("No valid rows. Use one per line: First, Last, YYYY-MM-DD, rank"); return; }
    setSaving(true); setErr("");
    const { error } = await supabase.from("competitors").insert(rows);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setImportText(""); setImportOpen(false); setSavedMsg(`Imported ${rows.length} competitor${rows.length === 1 ? "" : "s"}.`); load();
  }
  async function setRank(id: string, rank: string) {
    setRoster((r) => r.map((a) => (a.id === id ? { ...a, declared_rank: rank } : a)));
    const { error } = await supabase.from("competitors").update({ declared_rank: rank }).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }
  // Assign a rank to a bridge-invited (pending) athlete — school owns rank, so this
  // is set before the guardian redeems; RLS restricts it to this school's records.
  async function setPendingRank(id: string, rank: string) {
    setPending((p) => p.map((a) => (a.id === id ? { ...a, declared_rank: rank || null } : a)));
    const { error } = await supabase.from("bridge_pending_athletes").update({ declared_rank: rank || null }).eq("id", id);
    if (error) { setErr(error.message); load(); }
  }
  function currentSettings(id: string): Settings {
    return settings[id] ?? { competitor_id: id, allowed_events: null, dueling_enabled: false, competition_class: null, geo_exclude_miles: null, merch_enabled: false };
  }
  async function saveSetting(id: string, patch: Partial<Settings>) {
    if (!school) return;
    const next = { ...currentSettings(id), ...patch };
    setSettings((s) => ({ ...s, [id]: next })); // optimistic
    const { error } = await supabase.from("student_tournament_settings").upsert({
      competitor_id: id, school_id: school.id, allowed_events: next.allowed_events, dueling_enabled: next.dueling_enabled,
      competition_class: next.competition_class, geo_exclude_miles: next.geo_exclude_miles, merch_enabled: next.merch_enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "competitor_id" });
    if (error) { setErr(error.message); load(); }
  }
  function setAddr(patch: Partial<Address>) { setProfile((p) => (p ? { ...p, address: { ...(p.address ?? {}), ...patch } } : p)); }
  async function saveProfile() {
    if (!profile) return;
    setSaving(true); setErr(""); setSavedMsg("");
    const { error } = await supabase.from("schools").update({
      name: profile.name, contact_name: profile.contact_name, contact_email: profile.contact_email,
      phone: profile.phone, address: profile.address, logo_url: profile.logo_url,
    }).eq("id", profile.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    // geocode the (possibly changed) address → lat/lng
    let located = "";
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/geocode-school`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${sess.session?.access_token}` }, body: "{}",
      });
      const j = await res.json();
      located = j?.geocoded ? ` · located at ${Number(j.lat).toFixed(3)}, ${Number(j.lng).toFixed(3)}` : (j?.reason ? ` · ${j.reason}` : "");
    } catch { /* ignore */ }
    setSaving(false); setSavedMsg("Saved" + located);
    load();
  }

  const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 9, border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, fontSize: 14 };
  const inpF: React.CSSProperties = { ...inp, width: "100%" };
  const card = { background: neutrals.surface, border: `1px solid ${neutrals.border}`, borderRadius: 14 } as const;

  const paidEntries = entries.filter((e) => e.payment_status === "paid");
  const paidCount = paidEntries.length;
  const withVideoCount = paidEntries.filter((e) => e.video_url).length;
  const noVideoCount = paidCount - withVideoCount;
  const tier = school?.payout_tier ?? 0;
  const perPaidCents = Math.round((entryFeeCents * tier) / 100);
  const projectedCents = paidCount * perPaidCents;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const nameOf = (id: string) => { const a = roster.find((r) => r.id === id); return a ? `${a.first_name} ${a.last_name}` : "Athlete"; };
  const pendingNeedRank = pending.filter((p) => !p.declared_rank).length;

  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{ width: 210, flex: "none", background: "#0c0c0f", borderRight: `1px solid ${neutrals.border}`, padding: "16px 12px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "4px 6px 14px", borderBottom: `1px solid ${neutrals.border}`, marginBottom: 12 }}>
          <div style={{ height: 3, width: 60, borderRadius: 99, background: spectrum, marginBottom: 8 }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>{school ? school.name : "School"}</div>
          <div style={{ color: neutrals.muted2, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>School Portal</div>
        </div>
        {NAV.map((n) => (
          <button key={n.key} onClick={() => setSection(n.key)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: 9, marginBottom: 2, border: "none", cursor: "pointer", fontSize: 13,
              background: section === n.key ? "#17161a" : "transparent", color: section === n.key ? neutrals.text : neutrals.muted }}>
            <span style={{ fontSize: 15 }}>{n.icon}</span>{n.label}
            {n.key === "roster" && pendingNeedRank > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: "#141210", background: hues.gold.hi, borderRadius: 99, padding: "1px 7px" }}>{pendingNeedRank}</span>
            )}
          </button>
        ))}
        <button onClick={async () => { await supabase.auth.signOut(); router.replace("/school/login"); }}
          style={{ display: "flex", gap: 10, width: "100%", padding: "9px 10px", marginTop: 12, borderRadius: 9, border: `1px solid ${neutrals.border}`, background: "none", color: neutrals.muted, cursor: "pointer", fontSize: 13 }}>Sign out</button>
      </aside>

      {/* Main */}
      <section style={{ flex: 1, minWidth: 0, padding: "22px 26px 60px", maxWidth: 900 }}>
        {loading && <p style={{ color: neutrals.muted }}>Loading…</p>}
        {err && <p style={{ color: status.danger }}>{err}</p>}
        {!loading && school && (
          <>
            <SecHd>{NAV.find((n) => n.key === section)?.label}</SecHd>

            {section === "roster" && (
              <>
                {pending.length > 0 && (
                  <div style={{ ...card, padding: 16, marginBottom: 22, borderColor: hues.amethyst.base }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: hues.amethyst.hi }}>⏳ Invited from your membership</div>
                      <Hint on={hintsOn} align="right">These students were provisioned from your NMAO membership roster. Assign each a competitive <b>rank</b> — then their guardian finishes registration (consent + payment) from the invite link. Rank is yours to set; guardians can&apos;t change it.</Hint>
                    </div>
                    <div style={{ color: neutrals.muted, fontSize: 13, marginBottom: 12 }}>
                      {pendingNeedRank > 0
                        ? `${pendingNeedRank} of ${pending.length} still need a rank before their guardian redeems.`
                        : `All ${pending.length} have a rank set — ready for guardians to redeem.`}
                    </div>
                    {pending.map((a) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: `1px solid ${neutrals.surface2}` }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{a.first_name} {a.last_name}</div>
                          <div style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2 }}>{a.dob ? `Age ${ageOf(a.dob)} · ` : ""}{a.belt_name ? `Belt on file: ${a.belt_name}` : "No belt on file"}</div>
                        </div>
                        <select value={a.declared_rank ?? ""} onChange={(e) => setPendingRank(a.id, e.target.value)} title="Set this athlete's competitive rank"
                          style={{ ...inp, background: a.declared_rank ? neutrals.surface2 : "rgba(230,185,63,0.12)", borderColor: a.declared_rank ? neutrals.border : hues.gold.shadow }}>
                          <option value="">— set rank —</option>
                          {RANKS.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ ...card, padding: 16, marginBottom: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: neutrals.muted2 }}>Add athlete</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => setImportOpen(true)} style={{ border: `1px solid ${neutrals.border}`, background: "transparent", color: neutrals.text, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⬆ Import list</button>
                      <Hint on={hintsOn} align="right">Bulk-add competitors — one per line as <code>First, Last, YYYY-MM-DD, rank</code>. Date &amp; rank are optional (rank defaults to beginner).</Hint>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 150px", gap: 10 }}>
                    <input style={inp} placeholder="First name" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} />
                    <input style={inp} placeholder="Last name" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} />
                    <input style={inp} type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
                    <select style={inp} value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })}>{RANKS.map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select>
                  </div>
                  <button onClick={addAthlete} disabled={saving} style={{ marginTop: 12, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "10px 20px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: saving ? 0.6 : 1 }}>{saving ? "Adding…" : "Add to roster"}</button>
                </div>
                {roster.map((a) => (
                  <div key={a.id} style={{ ...card, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div><div style={{ fontSize: 15, fontWeight: 600 }}>{a.first_name} {a.last_name}</div>
                      <div style={{ color: neutrals.muted, fontSize: 13, marginTop: 3 }}>Age {ageOf(a.dob)} · Rating {ratings[a.id] != null ? Math.round(ratings[a.id]) : "—"}{medals[a.id] ? ` · 🏅 ${medals[a.id]}` : ""}</div></div>
                    <select value={a.declared_rank ?? "beginner"} onChange={(e) => setRank(a.id, e.target.value)} style={{ ...inp, background: neutrals.surface2 }} title="Rank — only the school owner can change this">{RANKS.map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select>
                  </div>
                ))}
              </>
            )}

            {section === "controls" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                  <span style={{ color: neutrals.muted, fontSize: 13 }}>Competitor</span>
                  <input style={{ ...inp, width: 170 }} placeholder="Search…" value={ctlSearch} onChange={(e) => setCtlSearch(e.target.value)} />
                  <select style={inp} value={selStudent} onChange={(e) => setSelStudent(e.target.value)}>
                    {roster.filter((a) => `${a.first_name} ${a.last_name}`.toLowerCase().includes(ctlSearch.trim().toLowerCase())).map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                  </select>
                </div>
                {selStudent && (() => {
                  const s = currentSettings(selStudent);
                  return (
                    <div style={{ ...card, padding: "4px 16px" }}>
                      <CtlRow label="Event categories" sub="which events they may enter">
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {EVENTS.map((e) => {
                            const on = (s.allowed_events ?? []).includes(e.code);
                            return <Chip key={e.code} on={on} label={e.name} onClick={() => { const cur = s.allowed_events ?? []; saveSetting(selStudent, { allowed_events: on ? cur.filter((c) => c !== e.code) : [...cur, e.code] }); }} />;
                          })}
                        </div>
                      </CtlRow>
                      <CtlRow label="Class / level" sub="competition tier (from belt)">
                        <select style={{ ...inp, background: neutrals.surface2 }} value={s.competition_class ?? ""} onChange={(e) => saveSetting(selStudent, { competition_class: e.target.value || null })}>
                          <option value="">— set —</option>{CLASSES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
                        </select>
                      </CtlRow>
                      <CtlRow label="Dueling" sub="allow 1-v-1 challenges (per competitor)"><Toggle on={s.dueling_enabled} onChange={(v) => saveSetting(selStudent, { dueling_enabled: v })} /></CtlRow>
                      <CtlRow label="Geo-location" sub="compete only vs. schools farther than…">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input style={{ ...inp, width: 90 }} type="number" min={0} placeholder="miles" value={s.geo_exclude_miles ?? ""} onChange={(e) => saveSetting(selStudent, { geo_exclude_miles: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
                          <span style={{ color: neutrals.muted2, fontSize: 12 }}>miles</span>
                        </div>
                      </CtlRow>
                    </div>
                  );
                })()}
                <Hint on={hintsOn}>These apply per competitor. <b>Class/level</b> sets their competition tier; <b>Dueling</b> allows 1-v-1 challenges, matched according to your <b>Geo-location</b> setting — which only pairs them against schools beyond a set distance.</Hint>
                {!roster.length && <p style={{ color: neutrals.muted2 }}>Add athletes to your roster first.</p>}
              </>
            )}

            {section === "settings" && profile && (
              <div style={{ ...card, padding: 18, maxWidth: 580 }}>
                <Field label="School name"><input style={inpF} value={profile.name ?? ""} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Contact name"><input style={inpF} value={profile.contact_name ?? ""} onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })} /></Field>
                  <Field label="Phone"><input style={inpF} value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
                </div>
                <Field label="Contact email"><input style={inpF} value={profile.contact_email ?? ""} onChange={(e) => setProfile({ ...profile, contact_email: e.target.value })} /></Field>

                <div style={{ fontSize: 12, color: neutrals.muted2, letterSpacing: 1.2, textTransform: "uppercase", margin: "16px 0 8px" }}>Address · used for geo-matching</div>
                <Field label="Street"><input style={inpF} value={profile.address?.line1 ?? ""} onChange={(e) => setAddr({ line1: e.target.value })} /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                  <Field label="City"><input style={inpF} value={profile.address?.city ?? ""} onChange={(e) => setAddr({ city: e.target.value })} /></Field>
                  <Field label="State"><input style={inpF} value={profile.address?.state ?? ""} onChange={(e) => setAddr({ state: e.target.value })} /></Field>
                  <Field label="Postal"><input style={inpF} value={profile.address?.postal ?? ""} onChange={(e) => setAddr({ postal: e.target.value })} /></Field>
                </div>
                <Field label="Logo URL"><input style={inpF} placeholder="https://…" value={profile.logo_url ?? ""} onChange={(e) => setProfile({ ...profile, logo_url: e.target.value })} /></Field>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 14, borderTop: `1px solid ${neutrals.border}` }}>
                  <div><div style={{ fontSize: 14 }}>Show hints</div><div style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2 }}>Inline 💡 tips that explain the nuanced features</div></div>
                  <Toggle on={hintsOn} onChange={toggleHints} />
                </div>

                <div style={{ fontSize: 12.5, color: profile.lat != null ? status.success : neutrals.muted2, marginTop: 16 }}>
                  {profile.lat != null ? `📍 Located at ${Number(profile.lat).toFixed(3)}, ${Number(profile.lng).toFixed(3)}` : "Not geocoded yet — Save & locate to place this school on the map."}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                  <button onClick={saveProfile} disabled={saving} style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "10px 20px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save & locate"}</button>
                  {savedMsg && <span style={{ color: status.success, fontSize: 13 }}>{savedMsg}</span>}
                </div>
              </div>
            )}

            {section === "payouts" && (
              <>
                <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                  <div style={{ ...card, flex: 1, padding: "14px 16px" }}>
                    <div style={{ color: neutrals.muted, fontSize: 11 }}>Revenue-share tier</div>
                    <div style={{ fontSize: 24, fontWeight: 600, marginTop: 3 }}>{school.payout_tier != null ? `${school.payout_tier}%` : "—"}</div>
                    <div style={{ color: neutrals.muted2, fontSize: 11 }}>set by accreditation</div>
                  </div>
                  <div style={{ ...card, flex: 1, padding: "14px 16px" }}>
                    <div style={{ color: neutrals.muted, fontSize: 11 }}>Payouts</div>
                    <div style={{ fontSize: 24, fontWeight: 600, marginTop: 3, color: connect?.payouts_enabled ? "#7ED0A0" : hues.gold.hi }}>
                      {connect?.payouts_enabled ? "Enabled" : connect?.connected ? "Setup incomplete" : "Not connected"}
                    </div>
                    <div style={{ color: neutrals.muted2, fontSize: 11 }}>via Stripe Connect</div>
                  </div>
                </div>
                <Hint on={hintsOn}>Your revenue-share tier is set by your accreditation level. Payouts run through Stripe — you enter bank details on Stripe&apos;s page and NMAO never sees or stores them.</Hint>
                <div style={{ ...card, padding: 18, marginTop: 14 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Bank account</div>
                  <div style={{ color: neutrals.muted2, fontSize: 13, marginBottom: 14, maxWidth: 520, lineHeight: 1.5 }}>
                    {connect?.payouts_enabled
                      ? "Your bank is connected and payouts are enabled through Stripe."
                      : "Connect your bank through Stripe's secure onboarding to receive payouts. You enter your bank details on Stripe — this app never sees or stores them."}
                  </div>
                  {!connect?.payouts_enabled && (
                    <button onClick={connectBank} disabled={saving}
                      style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "11px 22px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: saving ? 0.6 : 1 }}>
                      {saving ? "Opening Stripe…" : connect?.connected ? "Finish bank setup" : "Connect bank account"}
                    </button>
                  )}
                </div>
              </>
            )}

            {section === "entries" && (
              <>
                <div style={{ ...card, padding: 16, marginBottom: 22 }}>
                  <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: neutrals.muted2, marginBottom: 12 }}>Register an athlete</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <select style={inp} value={entryForm.competitor} onChange={(e) => setEntryForm({ ...entryForm, competitor: e.target.value })}>
                      {roster.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                    </select>
                    <select style={inp} value={entryForm.event} onChange={(e) => setEntryForm({ ...entryForm, event: e.target.value })}>
                      {EVENTS.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}
                    </select>
                  </div>
                  <button onClick={registerEntry} disabled={saving || !roster.length}
                    style={{ marginTop: 12, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "10px 20px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Registering…" : "Register athlete"}
                  </button>
                  {savedMsg && <span style={{ color: status.success, fontSize: 13, marginLeft: 12 }}>{savedMsg}</span>}
                  <div style={{ color: neutrals.muted2, fontSize: 12, marginTop: 10 }}>You register — the parent/guardian pays the entry fee in the Compete app to activate it.</div>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 0 12px" }}>
                  <span style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: neutrals.muted2 }}>Entries</span>
                  <span style={{ fontSize: 12, color: neutrals.muted2 }}>({entries.length})</span>
                </div>
                {entries.length === 0 && <p style={{ color: neutrals.muted2, fontSize: 14 }}>No entries yet — register an athlete above.</p>}
                {entries.map((en) => {
                  const a = roster.find((r) => r.id === en.competitor_id);
                  const paid = en.payment_status === "paid";
                  return (
                    <div key={en.id} style={{ ...card, padding: "13px 16px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{a ? `${a.first_name} ${a.last_name}` : "Athlete"}</div>
                        <div style={{ color: neutrals.muted, fontSize: 13, marginTop: 3 }}>{EVENTS.find((e) => e.code === en.event)?.name ?? en.event} · {en.video_url ? "video in" : "no video yet"}</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5,
                        color: paid ? "#7ED0A0" : hues.gold.hi, background: paid ? "rgba(90,154,106,0.14)" : "rgba(230,185,63,0.12)", border: `1px solid ${paid ? "#3f7a52" : hues.gold.shadow}` }}>
                        {paid ? "Paid" : "Awaiting payment"}
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {section === "dashboard" && (
              <>
                {deadline && (
                  <div style={{ ...card, padding: "12px 16px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: neutrals.muted2, letterSpacing: 1, textTransform: "uppercase" }}>Next submission closes in</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: hues.gold.hi, marginTop: 2 }}>{nowTs ? countdown(deadline, nowTs) : "…"}</div>
                    </div>
                    <div style={{ color: neutrals.muted, fontSize: 12, textAlign: "right" }}>{new Date(deadline).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                  <Kpi label="Roster" value={String(roster.length)} onClick={() => setDrill(drill === "roster" ? null : "roster")} active={drill === "roster"} />
                  <Kpi label="Entered" value={String(paidCount)} sub={`${entries.length} total`} onClick={() => setDrill(drill === "entered" ? null : "entered")} active={drill === "entered"} />
                  <Kpi label="Videos in" value={`${withVideoCount} / ${paidCount}`} onClick={() => setDrill(drill === "videos" ? null : "videos")} active={drill === "videos"} />
                  <Kpi label="Projected income" value={money(projectedCents)} sub={tier ? `at ${tier}% payout tier` : "payout tier not set"} onClick={() => setDrill(drill === "income" ? null : "income")} active={drill === "income"} />
                </div>
                <Hint on={hintsOn}>Tap any tile for the breakdown. <b>Projected income</b> = paid entries × your payout tier × the entry fee.</Hint>

                {drill && (
                  <div style={{ ...card, padding: 14, marginBottom: 16 }}>
                    {drill === "roster" && (roster.length === 0 ? <p style={{ color: neutrals.muted2, fontSize: 13, margin: 0 }}>No competitors yet.</p> :
                      roster.map((a) => <DrillRow key={a.id} left={`${a.first_name} ${a.last_name}`} right={`Age ${ageOf(a.dob)} · ${cap(a.declared_rank ?? "beginner")}`} />))}
                    {drill === "entered" && (entries.length === 0 ? <p style={{ color: neutrals.muted2, fontSize: 13, margin: 0 }}>No entries yet.</p> :
                      entries.map((en) => <DrillRow key={en.id} left={`${nameOf(en.competitor_id)} · ${EVENTS.find((e) => e.code === en.event)?.name ?? en.event}`}
                        right={en.payment_status === "paid" ? "Registered ✓" : "Awaiting finalization"} good={en.payment_status === "paid"} warn={en.payment_status !== "paid"} />))}
                    {drill === "videos" && (paidEntries.length === 0 ? <p style={{ color: neutrals.muted2, fontSize: 13, margin: 0 }}>No paid entries yet.</p> :
                      paidEntries.map((en) => <DrillRow key={en.id} left={`${nameOf(en.competitor_id)} · ${EVENTS.find((e) => e.code === en.event)?.name ?? en.event}`}
                        right={en.video_url ? "Video in ✓" : "No video yet"} good={!!en.video_url} warn={!en.video_url} />))}
                    {drill === "income" && (
                      paidCount === 0 ? <p style={{ color: neutrals.muted2, fontSize: 13, margin: 0 }}>No paid entries yet — projected income is $0.</p> : <>
                        {paidEntries.map((en) => <DrillRow key={en.id} left={`${nameOf(en.competitor_id)} · ${EVENTS.find((e) => e.code === en.event)?.name ?? en.event}`} right={money(perPaidCents)} />)}
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 2px 2px", marginTop: 4, borderTop: `1px solid ${neutrals.border}` }}>
                          <span style={{ fontWeight: 700 }}>Projected total</span><span style={{ fontWeight: 700, color: "#7ED0A0" }}>{money(projectedCents)}</span>
                        </div>
                        <div style={{ color: neutrals.muted2, fontSize: 12, marginTop: 6 }}>Your {tier}% payout tier × {money(entryFeeCents)} entry fee, per paid entry. Set by accreditation.</div>
                      </>
                    )}
                  </div>
                )}
                {noVideoCount > 0 ? (
                  <div style={{ ...card, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{noVideoCount} athlete{noVideoCount > 1 ? "s" : ""} registered but haven&apos;t uploaded a video</div>
                      <div style={{ color: neutrals.muted, fontSize: 12, marginTop: 2 }}>A nudge helps them finish before the round closes.</div>
                    </div>
                    <button onClick={() => setSavedMsg("Reminders will send automatically once notifications ship.")}
                      style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "9px 18px", whiteSpace: "nowrap", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})` }}>
                      Remind {noVideoCount}
                    </button>
                  </div>
                ) : paidCount > 0 ? (
                  <div style={{ ...card, padding: 16, color: "#7ED0A0", fontSize: 14 }}>✓ Everyone who registered has uploaded — you&apos;re all set.</div>
                ) : (
                  <div style={{ ...card, padding: 16, color: neutrals.muted2, fontSize: 14 }}>No entries yet this round. Register athletes in the Entries tab.</div>
                )}
                {savedMsg && <p style={{ color: status.success, fontSize: 13, marginTop: 10 }}>{savedMsg}</p>}
              </>
            )}

            {section === "inhouse" && school && (
              <InHouse schoolId={school.id} roster={roster.map((a) => ({ id: a.id, first_name: a.first_name, last_name: a.last_name }))} />
            )}
          </>
        )}

        {importOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(6,6,8,0.8)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setImportOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 480, padding: 22 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Import competitors</div>
              <div style={{ color: neutrals.muted2, fontSize: 13, margin: "4px 0 12px" }}>One per line: <code>First, Last, YYYY-MM-DD, rank</code>. Date &amp; rank are optional (rank defaults to beginner).</div>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={"Maya, Ortiz, 2013-04-02, intermediate\nLiam, Chen, 2011-09-15"}
                style={{ ...inp, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => setImportOpen(false)} style={{ border: `1px solid ${neutrals.border}`, background: "transparent", color: neutrals.text, borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                <button onClick={importCompetitors} disabled={saving || !importText.trim()} style={{ border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 10, padding: "10px 20px", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: saving || !importText.trim() ? 0.5 : 1 }}>{saving ? "Importing…" : "Import"}</button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function SecHd({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: hues.gold.base, margin: "0 0 16px", borderBottom: `1px solid ${neutrals.border}`, paddingBottom: 8 }}>{children}</div>;
}
function Kpi({ label, value, sub, onClick, active }: { label: string; value: string; sub?: string; onClick?: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{ textAlign: "left", width: "100%", background: active ? "#17161a" : neutrals.surface, border: `1px solid ${active ? hues.gold.shadow : neutrals.border}`, borderRadius: 12, padding: "12px 14px", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ color: neutrals.muted, fontSize: 11, display: "flex", justifyContent: "space-between" }}>{label}{onClick && <span style={{ color: neutrals.muted2 }}>›</span>}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 3, color: neutrals.text }}>{value}</div>
      {sub && <div style={{ color: neutrals.muted2, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </button>
  );
}
function DrillRow({ left, right, good, warn }: { left: string; right: string; good?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px", borderBottom: `1px solid ${neutrals.surface2}`, fontSize: 13, gap: 12 }}>
      <span style={{ color: neutrals.text }}>{left}</span>
      <span style={{ color: good ? "#7ED0A0" : warn ? hues.gold.hi : neutrals.muted, whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );
}
function Hint({ on, children, align = "left" }: { on: boolean; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button onClick={() => setOpen((o) => !o)} title="Show hint"
        style={{ background: open ? neutrals.surface2 : "transparent", border: `1px solid ${neutrals.border}`, borderRadius: 999, cursor: "pointer", fontSize: 12, lineHeight: 1, padding: "3px 8px", color: neutrals.muted2 }}>💡</button>
      {open && (
        <div style={{ position: "absolute", zIndex: 50, top: "145%", ...(align === "right" ? { right: 0 } : { left: 0 }), width: 260, background: neutrals.surface2, border: `1px solid ${neutrals.border}`, borderRadius: 10, padding: "10px 12px", color: neutrals.text, fontSize: 12, lineHeight: 1.55, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>{children}</div>
      )}
    </span>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><div style={{ color: neutrals.muted2, fontSize: 11, marginBottom: 4 }}>{label}</div>{children}</div>;
}
function CtlRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${neutrals.surface2}`, gap: 14 }}>
      <div><div style={{ fontSize: 14 }}>{label}</div><div style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2 }}>{sub}</div></div>
      <div>{children}</div>
    </div>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      style={{ width: 46, height: 26, borderRadius: 99, padding: 3, border: on ? "none" : `1.5px solid ${neutrals.border}`, background: on ? spectrum : "transparent", cursor: "pointer", display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center" }}>
      <span style={{ width: 18, height: 18, borderRadius: 99, background: on ? "#fff" : neutrals.muted2, display: "block" }} />
    </button>
  );
}
function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, padding: "5px 11px", borderRadius: 99, cursor: "pointer", fontWeight: 600,
      border: on ? "none" : `1px solid ${neutrals.border}`, color: on ? "#fff" : neutrals.muted,
      background: on ? `linear-gradient(160deg, ${hues.sapphire.hi}, ${hues.sapphire.base})` : "transparent" }}>{label}</button>
  );
}
