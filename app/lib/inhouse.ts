import { supabase } from "./supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

// A tiny count for the Compete "School Tournaments" card: how many in-house
// events are open to join + how many finish-up tasks (unpaid dues / videos due)
// the active competitor has. Reuses the existing in-house EFs; best-effort.
export type InhouseSummary = { open: number; tasks: number };
export async function inhouseSummary(competitorId: string): Promise<InhouseSummary> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { open: 0, tasks: 0 };
    const headers = { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${session.access_token}` };
    const [toursRes, duesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/functions/v1/list-my-inhouse-tournaments`, { method: "POST", headers, body: JSON.stringify({ competitor_id: competitorId }) }),
      fetch(`${SUPABASE_URL}/functions/v1/my-inhouse-dues`, { method: "POST", headers, body: "{}" }),
    ]);
    const tj = await toursRes.json().catch(() => ({}));
    const dj = await duesRes.json().catch(() => ({}));
    const open = Array.isArray(tj?.tournaments) ? tj.tournaments.length : 0;
    const tasks = (Array.isArray(dj?.dues) ? dj.dues.length : 0) + (Array.isArray(dj?.videos) ? dj.videos.length : 0);
    return { open, tasks };
  } catch {
    return { open: 0, tasks: 0 };
  }
}
