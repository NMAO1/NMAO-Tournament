"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { neutrals } from "@nmao/design-tokens";

// A QR of the tournament's public registration URL, with PNG / JPEG / PDF
// downloads for a school to print or share. One QR per in-house tournament.
export default function QrDownloads({ url, title }: { url: string; title: string }) {
  const [preview, setPreview] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" }).then(setPreview).catch(() => setPreview(""));
  }, [url]);

  const safe = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "tournament";

  function triggerDownload(dataUrl: string, filename: string) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function download(fmt: "png" | "jpeg" | "pdf") {
    const img = await QRCode.toDataURL(url, {
      width: 1024, margin: 2, errorCorrectionLevel: "M",
      type: fmt === "jpeg" ? "image/jpeg" : "image/png",
    });
    if (fmt === "pdf") {
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pw = doc.internal.pageSize.getWidth();
      const size = 320;
      doc.setFontSize(20); doc.text(title, pw / 2, 96, { align: "center" });
      doc.setFontSize(12); doc.setTextColor(120); doc.text("Scan to register", pw / 2, 122, { align: "center" });
      doc.addImage(img, "PNG", (pw - size) / 2, 150, size, size);
      doc.setFontSize(11); doc.setTextColor(90); doc.text(url, pw / 2, 150 + size + 32, { align: "center" });
      doc.save(`${safe}-qr.pdf`);
      return;
    }
    triggerDownload(img, `${safe}-qr.${fmt === "jpeg" ? "jpg" : "png"}`);
  }

  const btn: React.CSSProperties = { border: `1px solid ${neutrals.border}`, background: "transparent", color: neutrals.text, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: neutrals.muted2, marginBottom: 8 }}>Registration QR code — print it or drop it in a flyer:</div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {preview ? <img src={preview} alt="Registration QR code" width={132} height={132} style={{ borderRadius: 10, background: "#fff", padding: 8 }} /> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => download("png")}>Download PNG</button>
          <button style={btn} onClick={() => download("jpeg")}>Download JPEG</button>
          <button style={btn} onClick={() => download("pdf")}>Download PDF</button>
        </div>
      </div>
    </div>
  );
}
