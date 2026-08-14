import { supabase } from "./supabase";

export type Scope = "bracket" | "school" | "global";
export type LbRow = { rank: number; name: string; school: string | null; rating: number; wins: number; streak: number; you: boolean };
export type VoterRow = { rank: number; name: string; votesCast: number; accuracy: number | null; you: boolean };

export async function standings(competitorId: string, scope: Scope): Promise<LbRow[]> {
  const { data } = await supabase.rpc("duel_leaderboard", { p_competitor_id: competitorId, p_scope: scope, p_limit: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ rank: r.rank, name: r.name, school: r.school ?? null, rating: r.rating, wins: r.wins, streak: r.streak, you: !!r.is_you }));
}

export async function voterBoard(competitorId: string): Promise<VoterRow[]> {
  const { data } = await supabase.rpc("voter_leaderboard", { p_competitor_id: competitorId, p_limit: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ rank: r.rank, name: r.name, votesCast: r.votes_cast, accuracy: r.accuracy ?? null, you: !!r.is_you }));
}
