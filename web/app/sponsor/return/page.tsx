"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { neutrals, spectrum, hues } from "@nmao/design-tokens";

function Inner() {
  const paid = useSearchParams().get("status") === "paid";
  return (
    <div style={{ maxWidth: 460, textAlign: "center" }}>
      <div style={{ height: 4, width: 150, borderRadius: 99, background: spectrum, margin: "0 auto 20px" }} />
      <div style={{ fontSize: 44, marginBottom: 10 }}>{paid ? "🎉" : "🥋"}</div>
      <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, margin: "0 0 12px" }}>{paid ? "Welcome aboard!" : "Thanks for your interest"}</h1>
      <p style={{ color: neutrals.muted, fontSize: 15, lineHeight: 1.6 }}>
        {paid
          ? "Your subscription is active. Our team is reviewing your ad and products now — they'll go live across the app as soon as they're approved. We'll be in touch by email."
          : "Your checkout didn't complete. You can head back and try again anytime."}
      </p>
      <a href="/sponsor" style={{ display: "inline-block", marginTop: 22, color: hues.gold.hi, fontSize: 14, textDecoration: "none", border: `1px solid ${neutrals.border}`, borderRadius: 10, padding: "10px 18px" }}>Back to sponsor signup</a>
    </div>
  );
}

export default function SponsorReturn() {
  return (
    <main style={{ minHeight: "100vh", background: neutrals.bg, color: neutrals.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <Suspense fallback={null}><Inner /></Suspense>
    </main>
  );
}
