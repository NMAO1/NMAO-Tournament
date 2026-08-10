import { supabase } from "./supabase";

export type BadgeAward = {
  id: string;
  badge_code: string;
  tier: string | null;
  name: string;
  description: string | null;
  rarity: string | null;
  emblem_key: string | null;
};

// Public URL for a badge's art in the badge-emblems bucket. emblem_key is the
// object path incl. extension, e.g. "perfect_season_champion.png".
export function emblemUrl(emblemKey: string | null): string | null {
  if (!emblemKey) return null;
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/badge-emblems/${emblemKey}`;
}

// Awards the competitor has earned but not yet SEEN — these drive the unlock
// reveal. Joins the catalog for name/rarity/emblem. Empty until you award badges.
export async function unseenAwards(competitorId: string): Promise<BadgeAward[]> {
  const { data } = await supabase
    .from("badge_awards")
    .select("id, badge_code, tier, badges!inner(name, description, rarity, emblem_key)")
    .eq("competitor_id", competitorId)
    .eq("seen", false)
    .order("awarded_at", { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((a) => {
    const b = Array.isArray(a.badges) ? a.badges[0] : a.badges;
    return {
      id: a.id, badge_code: a.badge_code, tier: a.tier,
      name: b?.name ?? a.badge_code, description: b?.description ?? null,
      rarity: b?.rarity ?? null, emblem_key: b?.emblem_key ?? null,
    };
  });
}

export async function markSeen(ids: string[]): Promise<void> {
  if (!ids.length) return;
  try { await supabase.from("badge_awards").update({ seen: true }).in("id", ids); } catch { /* silent */ }
}
