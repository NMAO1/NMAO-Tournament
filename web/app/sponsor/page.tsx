"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { neutrals, spectrum, hues, status as st } from "@nmao/design-tokens";

type Tier = { id: string; name: string; code: string; monthly_price_cents: number; product_slots: number; purchasable: boolean; offerings: string[] };
type Product = { name: string; price_display: string; product_url: string; image_url: string | null };

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function SponsorSignup() {
  const supabase = createClient();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [tierId, setTierId] = useState<string>("");
  const [f, setF] = useState({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", website: "", tagline: "", ad_click_url: "" });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { supabase.rpc("public_sponsor_tiers").then(({ data }) => { const t = (data ?? []) as Tier[]; setTiers(t); const first = t.find((x) => x.purchasable) ?? t[0]; if (first) setTierId(first.id); }); }, [supabase]);

  // Upload a file: ask the EF for a signed URL, then upload straight to storage.
  const upload = useCallback(async (kind: "logo" | "video" | "product", file: File): Promise<string | null> => {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const res = await fetch(`${SUPA}/functions/v1/sponsor-upload-url`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` }, body: JSON.stringify({ kind, ext }) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || "Upload failed.");
    const { error } = await supabase.storage.from(j.bucket).uploadToSignedUrl(j.path, j.token, file);
    if (error) throw new Error(error.message);
    return j.publicUrl as string;
  }, [supabase]);

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setErr(""); setBusy("logo");
    try { setLogoUrl(await upload("logo", file)); } catch (x) { setErr((x as Error).message); } finally { setBusy(""); }
  }
  async function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setErr("");
    if (file.size > 60 * 1024 * 1024) return setErr("Video must be under 60 MB.");
    // client-side duration check: 10–15s
    const dur = await new Promise<number>((resolve) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => resolve(v.duration); v.onerror = () => resolve(-1); v.src = URL.createObjectURL(file); });
    if (dur > 0 && (dur < 8 || dur > 16)) return setErr(`Ad should be 10–15 seconds (this is ${Math.round(dur)}s).`);
    setBusy("video");
    try { setVideoUrl(await upload("video", file)); } catch (x) { setErr((x as Error).message); } finally { setBusy(""); }
  }
  async function pickProductImg(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setBusy(`p${i}`);
    try { const url = await upload("product", file); setProducts((ps) => ps.map((p, ix) => ix === i ? { ...p, image_url: url } : p)); } catch (x) { setErr((x as Error).message); } finally { setBusy(""); }
  }

  async function submit() {
    setErr("");
    if (!f.company_name.trim()) return setErr("Company name is required.");
    if (!f.contact_email.trim()) return setErr("A contact email is required.");
    if (!tierId) return setErr("Choose a plan.");
    if (!agree) return setErr("Please accept the content guidelines.");
    setBusy("submit");
    try {
      const res = await fetch(`${SUPA}/functions/v1/sponsor-signup`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          ...f, tier_id: tierId, logo_url: logoUrl, accepted_guidelines: agree, origin: location.origin,
          ad: videoUrl ? { video_url: videoUrl, tagline: f.tagline, click_url: f.ad_click_url || f.website } : null,
          products: products.filter((p) => p.name && p.product_url),
        }),
      });
      const j = await res.json();
      if (!j.ok) { setBusy(""); return setErr(j.error || "Could not start checkout."); }
      window.location.href = j.url;
    } catch { setBusy(""); setErr("Network error — please try again."); }
  }

  const price = (c: number) => c > 0 ? `$${(c / 100).toFixed(0)}/mo` : "—";
  const input: React.CSSProperties = { width: "100%", padding: 11, borderRadius: 10, border: `1px solid ${neutrals.border}`, background: "#0e0e11", color: neutrals.text, fontSize: 15, marginBottom: 4 };
  const lbl: React.CSSProperties = { fontSize: 12, color: neutrals.muted, margin: "12px 0 4px", display: "block" };

  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, fontFamily: "Inter, system-ui, sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ height: 4, width: 160, borderRadius: 99, background: spectrum, margin: "0 auto 16px" }} />
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, textAlign: "center", margin: "0 0 6px" }}>Become an NMAO Sponsor</h1>
        <p style={{ color: neutrals.muted, textAlign: "center", fontSize: 14, margin: "0 0 24px" }}>Reach a passionate martial-arts audience — ads, a store listing, branded frames, and more.</p>

        <Section title="Your brand" />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Company name *</label><input style={input} value={f.company_name} onChange={set("company_name")} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Tagline</label><input style={input} value={f.tagline} onChange={set("tagline")} placeholder="Gear up for greatness" /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Contact name</label><input style={input} value={f.contact_name} onChange={set("contact_name")} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Contact email *</label><input style={input} type="email" value={f.contact_email} onChange={set("contact_email")} /></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Phone</label><input style={input} value={f.contact_phone} onChange={set("contact_phone")} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Website</label><input style={input} value={f.website} onChange={set("website")} placeholder="https://" /></div>
        </div>
        <label style={lbl}>Logo {logoUrl ? "✓ uploaded" : ""}</label>
        <input type="file" accept="image/*" onChange={pickLogo} disabled={busy === "logo"} style={{ color: neutrals.muted, fontSize: 13 }} />

        <Section title="Your ad (optional — 10–15s video)" />
        <input type="file" accept="video/*" onChange={pickVideo} disabled={busy === "video"} style={{ color: neutrals.muted, fontSize: 13 }} />
        {videoUrl ? <p style={{ color: st.success, fontSize: 12, marginTop: 6 }}>✓ Video uploaded</p> : null}
        <label style={lbl}>“Learn more” link</label>
        <input style={input} value={f.ad_click_url} onChange={set("ad_click_url")} placeholder="https://sponsor.com/nmao (defaults to your website)" />

        <Section title="Store products (optional)" />
        {products.map((p, i) => (
          <div key={i} style={{ border: `1px solid ${neutrals.border}`, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 2 }}><label style={lbl}>Name</label><input style={input} value={p.name} onChange={(e) => setProducts((ps) => ps.map((x, ix) => ix === i ? { ...x, name: e.target.value } : x))} /></div>
              <div style={{ flex: 1 }}><label style={lbl}>Price</label><input style={input} value={p.price_display} onChange={(e) => setProducts((ps) => ps.map((x, ix) => ix === i ? { ...x, price_display: e.target.value } : x))} placeholder="$29.99" /></div>
            </div>
            <label style={lbl}>Product URL</label><input style={input} value={p.product_url} onChange={(e) => setProducts((ps) => ps.map((x, ix) => ix === i ? { ...x, product_url: e.target.value } : x))} placeholder="https://" />
            <label style={lbl}>Image {p.image_url ? "✓" : ""}</label><input type="file" accept="image/*" onChange={(e) => pickProductImg(i, e)} disabled={busy === `p${i}`} style={{ color: neutrals.muted, fontSize: 13 }} />
          </div>
        ))}
        <button onClick={() => setProducts((ps) => [...ps, { name: "", price_display: "", product_url: "", image_url: null }])} style={{ background: "none", border: `1px dashed ${neutrals.border}`, color: neutrals.muted, borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>+ Add a product</button>

        <Section title="Choose your plan" />
        <div style={{ display: "grid", gap: 10 }}>
          {tiers.map((t) => (
            <button key={t.id} onClick={() => t.purchasable && setTierId(t.id)} disabled={!t.purchasable}
              style={{ textAlign: "left", background: tierId === t.id ? "rgba(233,193,90,0.1)" : "transparent", border: `1.5px solid ${tierId === t.id ? hues.gold.base : neutrals.border}`, borderRadius: 12, padding: 14, cursor: t.purchasable ? "pointer" : "not-allowed", opacity: t.purchasable ? 1 : 0.5, color: neutrals.text }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</span>
                <span style={{ color: hues.gold.hi, fontWeight: 800 }}>{t.purchasable ? price(t.monthly_price_cents) : "coming soon"}</span>
              </div>
              <div style={{ color: neutrals.muted, fontSize: 12.5, marginTop: 4 }}>{t.offerings.join(" · ")}</div>
            </button>
          ))}
        </div>

        <label onClick={() => setAgree(!agree)} style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "20px 0 0", cursor: "pointer" }}>
          <span style={{ flex: "none", width: 20, height: 20, borderRadius: 6, marginTop: 1, border: `1.5px solid ${agree ? hues.gold.base : neutrals.border}`, background: agree ? hues.gold.base : "transparent", color: "#141210", fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{agree ? "✓" : ""}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: neutrals.muted }}>I agree my content is family-appropriate for a platform used by minors, and I accept NMAO&apos;s sponsor content guidelines. My ad &amp; products are reviewed before going live.</span>
        </label>

        {err && <p style={{ color: st.danger, fontSize: 13, marginTop: 14, textAlign: "center" }}>{err}</p>}
        <button onClick={submit} disabled={!!busy}
          style={{ width: "100%", marginTop: 16, padding: 14, borderRadius: 11, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", background: `linear-gradient(160deg, ${hues.gold.hi}, ${hues.gold.base} 55%, ${hues.gold.shadow})`, opacity: busy ? 0.6 : 1, fontSize: 15 }}>
          {busy === "submit" ? "Starting checkout…" : busy ? "Uploading…" : "Continue to payment →"}
        </button>
        <p style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginTop: 10 }}>You&apos;ll be billed monthly. Your listing goes live once our team reviews it.</p>
      </div>
    </main>
  );
}

function Section({ title }: { title: string }) {
  return <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: hues.gold.base, margin: "26px 0 2px", borderBottom: `1px solid ${neutrals.border}`, paddingBottom: 6 }}>{title}</div>;
}
