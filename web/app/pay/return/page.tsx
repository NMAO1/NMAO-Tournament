"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Landing page Stripe Checkout returns to after a championship entry payment.
// The app opens Checkout in an in-app browser and closes it on return, then
// re-checks the entry's payment status (the webhook is the source of truth).
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nmao.us/app";

function PayReturnInner() {
  const canceled = useSearchParams().get("status") === "canceled";
  const wrap: React.CSSProperties = { minHeight: "100vh", background: "#0b0b0d", color: "#ececec", display: "flex", justifyContent: "center", alignItems: "center", padding: 20, fontFamily: "var(--font-geist-sans), system-ui, sans-serif" };
  const cardS: React.CSSProperties = { width: "100%", maxWidth: 400, background: "#161619", border: "1px solid #26262b", borderRadius: 18, padding: 32, textAlign: "center" };
  return (
    <div style={wrap}>
      <div style={cardS}>
        <div style={{ fontSize: 48 }}>{canceled ? "🥋" : "✅"}</div>
        <h1 style={{ fontSize: 22, margin: "14px 0 6px" }}>{canceled ? "Payment canceled" : "Payment complete!"}</h1>
        <p style={{ color: "#9a9aa2", fontSize: 15 }}>
          {canceled ? "Your entry isn't confirmed yet. Return to the NMAO app to try again." : "Your entry is confirmed. You can close this window and return to the NMAO app to upload your video."}
        </p>
        {!canceled && (
          <>
            <a href={APP_URL} style={{ display: "inline-block", marginTop: 20, border: "none", cursor: "pointer", fontWeight: 700, color: "#141210", borderRadius: 12, padding: "12px 22px", fontSize: 15, textDecoration: "none", background: "linear-gradient(160deg, #FFE39A, #E8B84B 55%, #A67C1F)" }}>Get the NMAO Compete app</a>
            <p style={{ color: "#66666e", fontSize: 12, marginTop: 10 }}>Don&apos;t have it yet? Track results, reveals, and future events.</p>
          </>
        )}
      </div>
    </div>
  );
}

// useSearchParams() must sit inside a Suspense boundary or the production build
// fails prerendering this page (Next.js CSR-bailout rule).
export default function PayReturn() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0b0d" }} />}>
      <PayReturnInner />
    </Suspense>
  );
}
