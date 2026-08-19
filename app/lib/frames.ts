import { supabase } from "./supabase";
import type { FrameAnim } from "./duel";

// Sponsor frames a competitor can equip (active sponsors with the custom_frame
// offering). Equipping one rings your duel video in the sponsor's brand.
export type SponsorFrameOption = {
  id: string; name: string; logoUrl: string | null; accentColor: string; label: string;
  imageUrl: string | null; animation: FrameAnim; sponsorName: string; equipped: boolean;
};

const asAnim = (a: unknown): FrameAnim => (a === "shimmer" || a === "pulse" || a === "sheen" ? a : "none");

export async function availableSponsorFrames(competitorId: string): Promise<SponsorFrameOption[]> {
  const { data, error } = await supabase.rpc("available_sponsor_frames", { p_competitor_id: competitorId });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((f) => ({
    id: f.id, name: f.name, logoUrl: f.logo_url ?? null, accentColor: f.accent_color ?? "#E9C15A",
    label: f.label ?? f.sponsor_name, imageUrl: f.image_url ?? null, animation: asAnim(f.animation),
    sponsorName: f.sponsor_name, equipped: !!f.equipped,
  }));
}

export async function equipSponsorFrame(competitorId: string, frameId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("set_equipped_sponsor_frame", { p_competitor_id: competitorId, p_frame: frameId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
