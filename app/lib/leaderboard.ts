import { supabase } from "./supabase";

export type Scope = "bracket" | "school" | "global";
export type Division = "all" | "beginner" | "intermediate" | "advanced";
export type LbRow = {
  rank: number; competitorId: string; name: string; school: string | null; belt: string | null;
  rating: number; wins: number; losses: number; draws: number; streak: number; bestStreak: number;
  duels: number; medals: number; winPct: number; you: boolean; prevRank: number | null;
};
export type VoterRow = { rank: number; name: string; votesCast: number; accuracy: number | null; you: boolean };

export async function standings(competitorId: string, scope: Scope, division: Division = "all", bracket: string = "all"): Promise<LbRow[]> {
  const { data } = await supabase.rpc("duel_leaderboard", { p_competitor_id: competitorId, p_scope: scope, p_division: division, p_bracket: bracket, p_limit: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    rank: r.rank, competitorId: r.competitor_id, name: r.name, school: r.school ?? null, belt: r.belt ?? null,
    rating: r.rating, wins: r.wins, losses: r.losses ?? 0, draws: r.draws ?? 0, streak: r.streak, bestStreak: r.best_streak ?? 0,
    duels: r.duels ?? 0, medals: r.medals ?? 0, winPct: r.win_pct ?? 0, you: !!r.is_you,
    prevRank: r.prev_rank ?? null,
  }));
}

export type TourRow = {
  rank: number; competitorId: string; name: string; school: string | null; belt: string | null;
  gold: number; silver: number; bronze: number; participation: number; medals: number; points: number; events: number; you: boolean; prevRank: number | null;
};
export type TScope = "season" | "all";
export async function tournamentBoard(competitorId: string, division: Division = "all", scope: TScope = "season", bracket: string = "all", event: string = "all"): Promise<TourRow[]> {
  const { data } = await supabase.rpc("tournament_leaderboard", { p_competitor_id: competitorId, p_division: division, p_scope: scope, p_bracket: bracket, p_event: event, p_limit: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    rank: r.rank, competitorId: r.competitor_id, name: r.name, school: r.school ?? null, belt: r.belt ?? null,
    gold: r.gold ?? 0, silver: r.silver ?? 0, bronze: r.bronze ?? 0, participation: r.participation ?? 0,
    medals: r.medals ?? 0, points: r.points ?? 0, events: r.events ?? 0, you: !!r.is_you,
    prevRank: r.prev_rank ?? null,
  }));
}

export type SchoolRow = { rank: number; schoolId: string; name: string; athletes: number; gold: number; silver: number; bronze: number; medals: number; points: number };
export async function schoolBoard(scope: TScope = "season", bracket: string = "all", event: string = "all"): Promise<SchoolRow[]> {
  const { data } = await supabase.rpc("school_leaderboard", { p_scope: scope, p_bracket: bracket, p_event: event, p_limit: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    rank: r.rank, schoolId: r.school_id, name: r.name, athletes: r.athletes ?? 0,
    gold: r.gold ?? 0, silver: r.silver ?? 0, bronze: r.bronze ?? 0, medals: r.medals ?? 0, points: r.points ?? 0,
  }));
}

export type BracketOption = { code: string; label: string };
export async function bracketOptions(): Promise<BracketOption[]> {
  const { data } = await supabase.rpc("age_bracket_options");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ code: r.code, label: r.label }));
}

export async function eventOptions(): Promise<string[]> {
  const { data } = await supabase.rpc("event_options");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => r.event as string);
}

export async function voterBoard(competitorId: string): Promise<VoterRow[]> {
  const { data } = await supabase.rpc("voter_leaderboard", { p_competitor_id: competitorId, p_limit: 50 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({ rank: r.rank, name: r.name, votesCast: r.votes_cast, accuracy: r.accuracy ?? null, you: !!r.is_you }));
}
