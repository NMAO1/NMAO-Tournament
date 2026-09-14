import type { Metadata } from "next";

// Distinct browser-tab title for the Ambassador Portal (amb.nmao.us).
export const metadata: Metadata = {
  title: "Ambassador Portal",
};

export default function PartnerGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
