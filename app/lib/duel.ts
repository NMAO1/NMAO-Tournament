import { supabase } from "./supabase";
import type { Rarity } from "@nmao/design-tokens";

// ============================================================
// Dueling data layer — wraps the live RPCs (spec APP-WIRING-SPEC.md §2/§8).
// All the SECURITY DEFINER RPCs enforce auth via nmao.competitor_ids().
// ============================================================

// A duel's event is an event_types code/name (Traditional Forms, …); kept as a
// string since the event list is data-driven.
export type DuelType = string;
export type Choice = "challenger" | "opponent";

function asRarity(r: string | null): Rarity {
  return r === "legendary" || r === "epic" || r === "rare" || r === "common" ? r : "common";
}

// ---- weekly duel allowance (duel_week_status) ----
export type WeekStatus = { used: number; limit: number; remaining: number; nextSlotAt: string | null };
export async function weekStatus(competitorId: string): Promise<WeekStatus> {
  const { data, error } = await supabase.rpc("duel_week_status", { p_competitor_id: competitorId });
  if (error || !data?.[0]) return { used: 0, limit: 4, remaining: 4, nextSlotAt: null };
  const r = data[0] as { used: number; weekly_limit: number; remaining: number; next_slot_at: string | null };
  return { used: r.used, limit: r.weekly_limit, remaining: r.remaining, nextSlotAt: r.next_slot_at };
}

// ---- vote queue (duel_vote_queue: frames + search) ----
export type QueueSide = {
  id: string; name: string; school: string | null; video: string | null; photo: string | null;
  frameCode: string | null; frameRarity: Rarity; frameName: string | null; frameDesc: string | null;
};
export type QueueDuel = {
  duelId: string; type: DuelType; closesVoteAt: string; voteCount: number;
  challenger: QueueSide; opponent: QueueSide;
};
export async function voteQueue(competitorId: string, search = "", limit = 20): Promise<QueueDuel[]> {
  const { data, error } = await supabase.rpc("duel_vote_queue", {
    p_competitor_id: competitorId, p_limit: limit, p_search: search || null,
  });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((d) => ({
    duelId: d.duel_id, type: d.duel_type, closesVoteAt: d.closes_vote_at, voteCount: Number(d.vote_count ?? 0),
    challenger: {
      id: d.challenger_id, name: d.challenger_name, school: d.challenger_school, video: d.challenger_video, photo: d.challenger_photo ?? null,
      frameCode: d.challenger_frame_code, frameRarity: asRarity(d.challenger_frame_rarity),
      frameName: d.challenger_frame_name, frameDesc: d.challenger_frame_desc,
    },
    opponent: {
      id: d.opponent_id, name: d.opponent_name, school: d.opponent_school, video: d.opponent_video, photo: d.opponent_photo ?? null,
      frameCode: d.opponent_frame_code, frameRarity: asRarity(d.opponent_frame_rarity),
      frameName: d.opponent_frame_name, frameDesc: d.opponent_frame_desc,
    },
  }));
}

// ---- cast a vote (cast_duel_vote — server rejects <15s watched) ----
export async function castVote(duelId: string, voterId: string, choice: Choice, watchedSeconds: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("cast_duel_vote", {
    p_duel_id: duelId, p_voter_competitor_id: voterId, p_choice: choice, p_watched_seconds: Math.floor(watchedSeconds),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ---- request a duel (random, system-matched opponent) ----
// The competitor picks only the EVENT; request_duel selects a random,
// rating-proximate, same-rank + same-age-bracket + in-geo opponent. No
// cherry-picking, and the opponent stays a mystery until the reveal.
export type DuelEvent = { code: string; name: string };
export async function duelEvents(): Promise<DuelEvent[]> {
  const { data, error } = await supabase.rpc("duel_events");
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((e) => ({ code: e.code, name: e.name }));
}
export async function requestDuel(competitorId: string, eventCode: string): Promise<{ ok: boolean; duelId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("request_duel", { p_competitor_id: competitorId, p_event: eventCode });
  return error ? { ok: false, error: error.message } : { ok: true, duelId: data as string };
}

// ---- respond to a challenge (respond_to_duel) ----
export async function respondToDuel(duelId: string, accept: boolean): Promise<{ ok: boolean; result?: string; error?: string }> {
  const { data, error } = await supabase.rpc("respond_to_duel", { p_duel_id: duelId, p_accept: accept });
  return error ? { ok: false, error: error.message } : { ok: true, result: data as string };
}

// ---- submit a duel video (path already uploaded) ----
export async function submitDuelVideo(duelId: string, competitorId: string, videoPath: string): Promise<{ ok: boolean; result?: string; error?: string }> {
  const { data, error } = await supabase.rpc("submit_duel_video", { p_duel_id: duelId, p_competitor_id: competitorId, p_video_url: videoPath });
  return error ? { ok: false, error: error.message } : { ok: true, result: data as string };
}

// ---- my active duels (Compete cards) — opponent MASKED until the reveal ----
export type ActiveDuel = {
  id: string; event: string; status: string; role: Choice;
  opponentName: string; myVideoIn: boolean; deadline: string | null;
};
export async function myActiveDuels(competitorId: string): Promise<ActiveDuel[]> {
  const { data, error } = await supabase.rpc("my_active_duels", { p_competitor_id: competitorId });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((d) => ({
    id: d.duel_id, event: d.event, status: d.status, role: d.role as Choice,
    opponentName: d.opp_name, myVideoIn: !!d.my_video_in, deadline: d.deadline ?? null,
  }));
}

// ---- face-off (duel_faceoff) — both Tale-of-the-Path cards, no tally ----
// A sponsor's branded frame: colors + logo + label, plus an optional product
// image and an animation style for the border (none | shimmer | pulse | sheen).
export type FrameAnim = "none" | "shimmer" | "pulse" | "sheen";
export type SponsorFrame = { id: string; name: string; logoUrl: string | null; accentColor: string; label: string; imageUrl: string | null; animation: FrameAnim };
function asAnim(a: unknown): FrameAnim { return a === "shimmer" || a === "pulse" || a === "sheen" ? a : "none"; }
export type Card = {
  competitorId: string; name: string; firstName: string; lastName: string;
  school: string | null; rank: string | null; ageBracket: string | null; photo: string | null;
  rating: number; duelWins: number; winStreak: number; bestStreak: number;
  frame: { code: string; name: string; rarity: Rarity; description: string | null } | null;
  sponsorFrame: SponsorFrame | null;
};
export type FaceOff = { duelId: string; type: DuelType; status: string; challenger: Card; opponent: Card };
function toCard(j: Record<string, unknown>): Card {
  const f = j.frame as Record<string, unknown> | null;
  const sf = j.sponsor_frame as Record<string, unknown> | null;
  return {
    competitorId: String(j.competitor_id), name: String(j.name), firstName: String(j.first_name), lastName: String(j.last_name),
    school: (j.school as string) ?? null, rank: (j.rank as string) ?? null, ageBracket: (j.age_bracket as string) ?? null,
    photo: (j.photo as string) ?? null, rating: Number(j.rating ?? 1200), duelWins: Number(j.duel_wins ?? 0),
    winStreak: Number(j.win_streak ?? 0), bestStreak: Number(j.best_streak ?? 0),
    frame: f ? { code: String(f.code), name: String(f.name), rarity: asRarity(f.rarity as string), description: (f.description as string) ?? null } : null,
    sponsorFrame: sf ? { id: String(sf.id), name: String(sf.name), logoUrl: (sf.logo_url as string) ?? null, accentColor: String(sf.accent_color ?? "#E9C15A"), label: String(sf.label ?? ""), imageUrl: (sf.image_url as string) ?? null, animation: asAnim(sf.animation) } : null,
  };
}
export async function faceOff(duelId: string): Promise<FaceOff | null> {
  const { data, error } = await supabase.rpc("duel_faceoff", { p_duel_id: duelId });
  if (error || !data) return null;
  const j = data as Record<string, unknown>;
  if (!j.challenger || !j.opponent) return null; // malformed payload — don't deref undefined
  return { duelId: String(j.duel_id), type: j.type as DuelType, status: String(j.status), challenger: toCard(j.challenger as Record<string, unknown>), opponent: toCard(j.opponent as Record<string, unknown>) };
}

// ---- reveal (duel_reveal) — face-off + tally + result (once the duel closes) ----
export type Reveal = FaceOff & {
  result: "challenger" | "opponent" | "draw" | "no_contest" | null;
  winnerId: string | null;
  challengerVotes: number; opponentVotes: number; totalVotes: number;
  challengerBackers: number; opponentBackers: number;
};
export async function duelReveal(duelId: string): Promise<Reveal | null> {
  const { data, error } = await supabase.rpc("duel_reveal", { p_duel_id: duelId });
  if (error || !data) return null;
  const j = data as Record<string, unknown>;
  return {
    duelId: String(j.duel_id), type: j.type as DuelType, status: String(j.status),
    challenger: toCard(j.challenger as Record<string, unknown>), opponent: toCard(j.opponent as Record<string, unknown>),
    result: (j.result as Reveal["result"]) ?? null, winnerId: (j.winner_id as string) ?? null,
    challengerVotes: Number(j.challenger_votes ?? 0), opponentVotes: Number(j.opponent_votes ?? 0), totalVotes: Number(j.total_votes ?? 0),
    challengerBackers: Number(j.challenger_backers ?? 0), opponentBackers: Number(j.opponent_backers ?? 0),
  };
}

// ---- sponsor ad (duel_sponsor) — one weighted-random active sponsor, or null.
// A short sponsor clip plays as an interstitial between the Tale of the Path and
// the vote ring. Returns null when there's nothing to show (so the ad is skipped).
export type Sponsor = { id: string; name: string; tagline: string | null; videoUrl: string; clickUrl: string | null; minSeconds: number };
export async function duelSponsor(viewerId?: string, event?: string): Promise<Sponsor | null> {
  const { data, error } = await supabase.rpc("duel_sponsor", { p_viewer: viewerId ?? null, p_event: event ?? null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (error || !row || !row.video_url) return null;
  return { id: row.id, name: row.name, tagline: row.tagline ?? null, videoUrl: row.video_url, clickUrl: row.click_url ?? null, minSeconds: Number(row.min_seconds ?? 3) };
}
// Count a view (fire-and-forget — never blocks the ad from showing).
export async function sponsorImpression(id: string): Promise<void> {
  try { await supabase.rpc("duel_sponsor_impression", { p_id: id }); } catch { /* best-effort */ }
}

// ---- signed playback URLs for the ring (get-playback-url EF, duel branch) ----
export async function playbackUrls(duelId: string): Promise<{ challenger: string | null; opponent: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-playback-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ duel_id: duelId }),
    });
    const j = await res.json();
    return { challenger: j?.challenger?.signedUrl ?? null, opponent: j?.opponent?.signedUrl ?? null };
  } catch {
    return { challenger: null, opponent: null };
  }
}
