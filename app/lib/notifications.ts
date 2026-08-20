import { supabase } from "./supabase";

// ============================================================
// Notifications + monthly-reveal reads (spec §7 / §8b).
// RLS scopes `notifications` and `monthly_reveals` to the caller's competitors,
// so no explicit competitor filter is needed here.
// ============================================================

export type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toNotif(n: any): Notif {
  return { id: n.id, type: n.type, title: n.title, body: n.body ?? null, data: n.data ?? null, read: !!n.read, createdAt: n.created_at };
}

export async function listNotifications(limit = 50): Promise<Notif[]> {
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, data, read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(toNotif);
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.rpc("mark_notification_read", { p_id: id });
}
export async function markAllRead(): Promise<void> {
  await supabase.rpc("mark_all_notifications_read");
}

/** Realtime: fire `cb` when a notification arrives for this user. Returns an unsubscribe. */
export function subscribeNotifications(cb: (n: Notif) => void, competitorIds?: string[]): () => void {
  // Route on competitor_id so Realtime delivers only THIS user's notifications
  // instead of pushing every insert to every client for a per-client RLS check
  // (that fan-out is the first thing to cap concurrency at national scale).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { event: "INSERT", schema: "public", table: "notifications" };
  if (competitorIds && competitorIds.length) {
    opts.filter = competitorIds.length === 1
      ? `competitor_id=eq.${competitorIds[0]}`
      : `competitor_id=in.(${competitorIds.join(",")})`;
  }
  const ch = supabase
    .channel("notifs")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .on("postgres_changes", opts, (payload: any) => cb(toNotif(payload.new)))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

// ---- monthly reveal ----
export type MonthlyReveal = { period: string; payload: Record<string, unknown> };

export async function latestUnseenMonthly(): Promise<MonthlyReveal | null> {
  const { data } = await supabase
    .from("monthly_reveals")
    .select("period, payload, seen")
    .eq("seen", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as { period: string; payload: Record<string, unknown> };
  return { period: r.period, payload: r.payload };
}

export async function markMonthlySeen(period: string): Promise<void> {
  await supabase.rpc("mark_monthly_reveal_seen", { p_period: period });
}
