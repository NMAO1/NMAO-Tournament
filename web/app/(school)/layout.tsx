import type { Metadata } from "next";

// Distinct browser-tab title for the School Portal (school.nmao.us).
export const metadata: Metadata = {
  title: "School Portal",
};

export default function SchoolGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
