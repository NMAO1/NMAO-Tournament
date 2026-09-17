// Maps a monthly-reveal period (YYYY-MM) to its soundtrack in the public
// reveal-music bucket. Nine tracks, one per season round, growing toward the
// finale. Season 1 round 1 = Jan 2027; any period wraps into 1..9 so a track
// always resolves (the reveal never blocks on this).
import { SUPABASE_URL } from "./env";
const SUPA = SUPABASE_URL;
const ANCHOR = 2027 * 12 + 1; // Jan 2027 = round 1

export function revealRound(period: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(period || "");
  if (!m) return 1;
  const months = Number(m[1]) * 12 + Number(m[2]);
  const r = months - ANCHOR + 1;
  return ((((r - 1) % 9) + 9) % 9) + 1; // clamp/wrap into 1..9
}

export function revealTrackUrl(period: string): string | null {
  if (!SUPA) return null;
  return `${SUPA}/storage/v1/object/public/reveal-music/round-${revealRound(period)}.mp3`;
}
