import { supabase } from "./supabase";

// The sponsor shown in the monthly reveal's bookend acts (pre-roll + end-card).
// Segment-targeted to the viewer via public.reveal_sponsor; resolved at view
// time (like the title / duel sponsors), so it always reflects the current
// active sponsor rather than whoever was live when the reveal was generated.
export type RevealSponsor = {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  color: string;            // brand color (hex) — always set (defaults to house gold server-side)
  message: string | null;   // end-card motivational line
  offer: string | null;     // end-card offer line
  storeUrl: string | null;  // "Shop the … store" link
};

export async function revealSponsor(viewer?: string | null): Promise<RevealSponsor | null> {
  const { data, error } = await supabase.rpc("reveal_sponsor", { p_viewer: viewer ?? null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (error || !row || !row.name) return null;
  return {
    name: row.name,
    logoUrl: row.logo_url ?? null,
    tagline: row.tagline ?? null,
    color: row.color || "#E6B93F",
    message: row.message ?? null,
    offer: row.offer ?? null,
    storeUrl: row.store_url ?? null,
  };
}
