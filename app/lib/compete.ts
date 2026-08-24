import { supabase } from "./supabase";

// Compete-tab dashboard — one RPC (public.compete_dashboard) returns the current
// round (state-aware), the competitor's per-event status, and their ratings.
export type CompeteEventStatus =
  | "not_entered" | "awaiting_payment" | "awaiting_video" | "in_judging" | "scored";

export type CompeteEvent = {
  event: string; name: string; status: CompeteEventStatus;
  entryId: string | null; medal: string | null; place: number | null;
};
export type CompeteRound = {
  seq: number; seasonName: string | null; state: string;
  opensAt: string | null; closesAt: string | null; judgingDeadline: string | null;
  submissionsOpen: boolean;
};
export type CompeteRating = {
  skill: number | null; skillProvisional: boolean;
  duel: number | null; duelWins: number; duelLosses: number; duelStreak: number;
  rank: string | null;
};
export type CompeteDashboard = { round: CompeteRound | null; events: CompeteEvent[]; rating: CompeteRating };

export async function competeDashboard(competitorId: string): Promise<CompeteDashboard | null> {
  const { data, error } = await supabase.rpc("compete_dashboard", { p_competitor: competitorId });
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  return {
    round: d.round ? {
      seq: d.round.seq, seasonName: d.round.season_name ?? null, state: d.round.state,
      opensAt: d.round.opens_at ?? null, closesAt: d.round.closes_at ?? null,
      judgingDeadline: d.round.judging_deadline ?? null, submissionsOpen: !!d.round.submissions_open,
    } : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events: ((d.events ?? []) as any[]).map((e) => ({
      event: e.event, name: e.name, status: e.status as CompeteEventStatus,
      entryId: e.entry_id ?? null, medal: e.medal ?? null, place: e.place ?? null,
    })),
    rating: {
      skill: d.rating?.skill ?? null, skillProvisional: !!d.rating?.skill_provisional,
      duel: d.rating?.duel ?? null, duelWins: d.rating?.duel_wins ?? 0,
      duelLosses: d.rating?.duel_losses ?? 0, duelStreak: d.rating?.duel_streak ?? 0,
      rank: d.rating?.rank ?? null,
    },
  };
}

// "6d 4h 12m" / "4h 12m 30s" / "12m 30s" / "Closed"
export function formatCountdown(closesAtIso: string, nowMs: number): string {
  const ms = new Date(closesAtIso).getTime() - nowMs;
  if (ms <= 0) return "Closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  return `${m}m ${ss}s`;
}
