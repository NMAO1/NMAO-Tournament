import { supabase } from "./supabase";
import type { Rarity } from "@nmao/design-tokens";

const asRarity = (r: unknown): Rarity => (r === "legendary" || r === "epic" || r === "rare" || r === "uncommon" || r === "common" ? r : "common");

export type ProfileInfo = {
  id: string; firstName: string; lastName: string; rank: string | null; style: string | null;
  photo: string | null; equippedBadge: string | null; equippedBadgeRarity: Rarity | null; equippedBadgeEmblem: string | null;
  school: { name: string; logo: string | null } | null;
  rating: number | null; wins: number; streak: number;
};

export async function loadProfile(competitorId: string): Promise<ProfileInfo | null> {
  const { data: c } = await supabase
    .from("competitors")
    .select("id, first_name, last_name, declared_rank, declared_style, profile_photo_url, equipped_badge_code, school_id, schools(name, logo_url)")
    .eq("id", competitorId)
    .maybeSingle();
  if (!c) return null;
  const { data: dr } = await supabase.from("duel_ratings").select("rating, wins, streak").eq("competitor_id", competitorId).maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cc = c as any;
  const s = Array.isArray(cc.schools) ? cc.schools[0] : cc.schools;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = dr as any;
  // The equipped badge's rarity tints the profile frame (falls back to belt rank
  // in the UI when nothing is equipped).
  let equippedBadgeRarity: Rarity | null = null;
  let equippedBadgeEmblem: string | null = null;
  if (cc.equipped_badge_code) {
    const { data: b } = await supabase.from("badges").select("rarity, emblem_key").eq("code", cc.equipped_badge_code).maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bb = b as any;
    if (bb) { equippedBadgeRarity = asRarity(bb.rarity); equippedBadgeEmblem = bb.emblem_key ?? cc.equipped_badge_code; }
  }
  return {
    id: cc.id, firstName: cc.first_name, lastName: cc.last_name, rank: cc.declared_rank ?? null, style: cc.declared_style ?? null,
    photo: cc.profile_photo_url ?? null, equippedBadge: cc.equipped_badge_code ?? null, equippedBadgeRarity, equippedBadgeEmblem,
    school: s ? { name: s.name, logo: s.logo_url ?? null } : null,
    rating: d ? d.rating : null, wins: d ? d.wins : 0, streak: d ? d.streak : 0,
  };
}

export type NotifPref = { type: string; enabled: boolean };
export async function loadNotifPrefs(): Promise<NotifPref[]> {
  const { data } = await supabase.from("notification_prefs").select("type, enabled");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((p) => ({ type: p.type, enabled: p.enabled }));
}
export async function setNotifPref(competitorId: string, type: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("notification_prefs").upsert({ competitor_id: competitorId, type, enabled });
  if (error) throw new Error(error.message);
}
