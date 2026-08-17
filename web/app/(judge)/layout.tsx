import type { Metadata } from "next";

// Distinct browser-tab title for the Judge app (judge.nmao.us).
export const metadata: Metadata = {
  title: "Judge",
};

export default function JudgeGroupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
