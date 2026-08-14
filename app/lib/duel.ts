import { supabase } from "./supabase";
import type { Rarity } from "@nmao/design-tokens";

// ============================================================
// Dueling data layer — wraps the live RPCs (spec APP-WIRING-SPEC.md §2/§8).
// All the SECURITY DEFINER RPCs enforce auth via nmao.competitor_ids().
// ============================================================

export type DuelType = "kata" | "weapon";
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
  id: string; name: string; school: string | null; video: string | null;
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
      id: d.challenger_id, name: d.challenger_name, school: d.challenger_school, video: d.challenger_video,
      frameCode: d.challenger_frame_code, frameRarity: asRarity(d.challenger_frame_rarity),
      frameName: d.challenger_frame_name, frameDesc: d.challenger_frame_desc,
    },
    opponent: {
      id: d.opponent_id, name: d.opponent_name, school: d.opponent_school, video: d.opponent_video,
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

// ---- matchmaking + create (find_duel_opponents → create_duel) ----
export type Opponent = { id: string; name: string; school: string | null; rank: string | null; ageBracket: string | null };
export async function findOpponents(competitorId: string, type: DuelType | null = null, limit = 20): Promise<Opponent[]> {
  const { data, error } = await supabase.rpc("find_duel_opponents", { p_competitor_id: competitorId, p_type: type, p_limit: limit });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((o) => ({ id: o.competitor_id, name: o.name, school: o.school, rank: o.declared_rank, ageBracket: o.age_bracket }));
}
export async function createDuel(challengerId: string, opponentId: string, type: DuelType): Promise<{ ok: boolean; duelId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("create_duel", { p_challenger_id: challengerId, p_opponent_id: opponentId, p_type: type });
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

// ---- my active duels (Compete section cards) ----
export type ActiveDuel = {
  id: string; type: DuelType; status: string; role: Choice;
  opponentId: string; opponentName: string; myVideoIn: boolean; deadline: string | null;
};
export async function myActiveDuels(competitorId: string): Promise<ActiveDuel[]> {
  const { data, error } = await supabase
    .from("duels")
    .select("id, type, status, challenger_id, opponent_id, challenger_video, opponent_video, response_deadline, upload_deadline, closes_vote_at, created_at")
    .or(`challenger_id.eq.${competitorId},opponent_id.eq.${competitorId}`)
    .in("status", ["pending", "accepted", "voting"])
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = data as any[];
  const oppIds = rows.map((d) => (d.challenger_id === competitorId ? d.opponent_id : d.challenger_id));
  const names = new Map<string, string>();
  if (oppIds.length) {
    const { data: comps } = await supabase.from("competitors").select("id, first_name, last_name").in("id", oppIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (comps as any[] | null)?.forEach((c) => names.set(c.id, `${c.first_name} ${c.last_name}`));
  }
  return rows.map((d) => {
    const role: Choice = d.challenger_id === competitorId ? "challenger" : "opponent";
    const opponentId = role === "challenger" ? d.opponent_id : d.challenger_id;
    const myVideoIn = role === "challenger" ? !!d.challenger_video : !!d.opponent_video;
    const deadline = d.status === "pending" ? d.response_deadline : d.status === "accepted" ? d.upload_deadline : d.closes_vote_at;
    return { id: d.id, type: d.type, status: d.status, role, opponentId, opponentName: names.get(opponentId) ?? "Opponent", myVideoIn, deadline };
  });
}

// ---- face-off (duel_faceoff) — both Tale-of-the-Path cards, no tally ----
export type Card = {
  competitorId: string; name: string; firstName: string; lastName: string;
  school: string | null; rank: string | null; ageBracket: string | null; photo: string | null;
  rating: number; duelWins: number; winStreak: number; bestStreak: number;
  frame: { code: string; name: string; rarity: Rarity; description: string | null } | null;
};
export type FaceOff = { duelId: string; type: DuelType; status: string; challenger: Card; opponent: Card };
function toCard(j: Record<string, unknown>): Card {
  const f = j.frame as Record<string, unknown> | null;
  return {
    competitorId: String(j.competitor_id), name: String(j.name), firstName: String(j.first_name), lastName: String(j.last_name),
    school: (j.school as string) ?? null, rank: (j.rank as string) ?? null, ageBracket: (j.age_bracket as string) ?? null,
    photo: (j.photo as string) ?? null, rating: Number(j.rating ?? 1200), duelWins: Number(j.duel_wins ?? 0),
    winStreak: Number(j.win_streak ?? 0), bestStreak: Number(j.best_streak ?? 0),
    frame: f ? { code: String(f.code), name: String(f.name), rarity: asRarity(f.rarity as string), description: (f.description as string) ?? null } : null,
  };
}
export async function faceOff(duelId: string): Promise<FaceOff | null> {
  const { data, error } = await supabase.rpc("duel_faceoff", { p_duel_id: duelId });
  if (error || !data) return null;
  const j = data as Record<string, unknown>;
  return { duelId: String(j.duel_id), type: j.type as DuelType, status: String(j.status), challenger: toCard(j.challenger as Record<string, unknown>), opponent: toCard(j.opponent as Record<string, unknown>) };
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
