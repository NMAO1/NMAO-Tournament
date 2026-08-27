import { supabase } from "./supabase";
import type { Rarity } from "@nmao/design-tokens";

// Badge vault + medal case (via the badge_vault definer RPC).
export type VaultBadge = { code: string; name: string; description: string | null; rarity: Rarity; emblemKey: string | null; tiered: boolean; earned: boolean; tier: string | null; seen: boolean };
export type VaultMedal = { tier: string; place: number | null; event: string | null };
export type Vault = { equipped: string | null; badges: VaultBadge[]; medals: VaultMedal[] };

const asRarity = (r: unknown): Rarity => (r === "legendary" || r === "epic" || r === "rare" || r === "uncommon" || r === "common" ? r : "common");

export async function loadVault(competitorId: string): Promise<Vault> {
  const { data } = await supabase.rpc("badge_vault", { p_competitor_id: competitorId });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (data as any) ?? {};
  return {
    equipped: j.equipped ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    badges: ((j.badges as any[]) ?? []).map((b) => ({ code: b.code, name: b.name, description: b.description ?? null, rarity: asRarity(b.rarity), emblemKey: b.emblem_key ?? null, tiered: !!b.tiered, earned: !!b.earned, tier: b.tier ?? null, seen: b.seen !== false })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    medals: ((j.medals as any[]) ?? []).map((m) => ({ tier: m.tier, place: m.place ?? null, event: m.event ?? null })),
  };
}

export async function equipFrame(competitorId: string, code: string | null): Promise<void> {
  await supabase.rpc("set_equipped_frame", { p_competitor_id: competitorId, p_code: code });
}
export async function markBadgesSeen(competitorId: string): Promise<void> {
  await supabase.rpc("mark_badges_seen", { p_competitor_id: competitorId });
}
export function emblemUrl(key: string | null): string | null {
  return key ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/badge-emblems/${key}` : null;
}
