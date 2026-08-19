import { supabase } from "./supabase";

// Prizes a champion has won, and claiming them (ships to the dojo).
export type MyPrize = {
  awardId: string; title: string; description: string | null; imageUrl: string | null;
  valueCents: number | null; sponsorName: string | null; claimStatus: string; awardedAt: string; fulfillment: string;
};

export async function myPrizes(competitorId: string): Promise<MyPrize[]> {
  const { data, error } = await supabase.rpc("my_prizes", { p_competitor_id: competitorId });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((p) => ({
    awardId: p.award_id, title: p.title, description: p.description ?? null, imageUrl: p.image_url ?? null,
    valueCents: p.value_cents ?? null, sponsorName: p.sponsor_name ?? null, claimStatus: p.claim_status,
    awardedAt: p.awarded_at, fulfillment: p.fulfillment_channel,
  }));
}

export async function claimPrize(awardId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("claim_prize", { p_award: awardId });
  return error ? { ok: false, error: error.message } : { ok: true };
}
