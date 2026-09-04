import { supabase } from "./supabase";
import { FRAME_SPECS } from "./badgeFrames";
import type { Card } from "./duel";

// Per-competitor metric bundle behind the living frames (from nmao.frame_stats).
export type FrameStats = {
  skill_rating: number; correct_votes: number; duel_wins: number; journal: number;
  events: number; medals_gold: number; medals_silver: number; medals_bronze: number;
  podiums: number; championships: number; seasons: number;
};

export async function fetchFrameStats(competitorId: string): Promise<FrameStats | null> {
  const { data } = await supabase.rpc("frame_stats", { p_competitor: competitorId });
  return (data as FrameStats) ?? null;
}

// Which FRAME_SPECS key an equipped badge code renders with (handles the shared
// specs: gem-sN → gem-series, season-champion-sN → grand-champion). null = no
// living frame for this badge → just the corner crest.
export function frameSpecKey(code: string | null | undefined): string | null {
  if (!code) return null;
  if (/^gem-s\d+$/.test(code)) return "gem-series";
  if (/^season-champion-s\d+$/.test(code)) return "grand-champion";
  return FRAME_SPECS[code] ? code : null;
}

// The progress VALUE a living frame grows on, for a given equipped badge. Uses the
// Card's already-loaded numbers where possible, else the fetched stats bundle.
export function frameValueFor(code: string | null | undefined, card: Card | null, stats: FrameStats | null): number {
  if (!code) return 0;
  if (/^gem-s\d+$/.test(code)) return stats?.seasons ?? 0;
  if (/^season-champion-s\d+$/.test(code)) return stats?.championships ?? 0;
  switch (code) {
    case "duelist":        return card?.duelWins ?? stats?.duel_wins ?? 0;
    case "journal_keeper": return stats?.journal ?? 0;
    case "zen":            return stats?.journal ?? 0;
    case "oracle":         return stats?.correct_votes ?? 0;
    case "precision":      return stats?.skill_rating ?? 0;
    case "ascent":         return stats?.skill_rating ?? 0;
    case "podium":         return stats?.podiums ?? 0;
    case "weapon-master":  return stats?.events ?? 0;
    case "grand-champion": return stats?.championships ?? 0;
    case "first-gold":     return stats?.medals_gold ?? 0;
    case "first-silver":   return stats?.medals_silver ?? 0;
    case "first-bronze":   return stats?.medals_bronze ?? 0;
    default:               return 0;
  }
}
