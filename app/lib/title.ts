import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Title sponsorship — "presented by ___" on a season or event surface.
export type TitleSponsor = { name: string; logoUrl: string | null; tagline: string | null };

async function one(rpc: string, args?: Record<string, unknown>): Promise<TitleSponsor | null> {
  const { data, error } = await supabase.rpc(rpc, args ?? {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (error || !row) return null;
  return { name: row.company_name, logoUrl: row.logo_url ?? null, tagline: row.tagline ?? null };
}
export const titleSponsorSeason = (viewer?: string) => one("title_sponsor_season", { p_viewer: viewer ?? null });
export const titleSponsorEvent = (event: string, viewer?: string) => one("title_sponsor_event", { p_event: event, p_viewer: viewer ?? null });

// The title sponsor for a duel: prefer the event's sponsor, else the season's —
// matched to the VIEWER's segment (region/state/age), so a regional title
// sponsor is shown to competitors in their region.
export function useTitleSponsor(viewer?: string, eventCode?: string): TitleSponsor | null {
  const [ts, setTs] = useState<TitleSponsor | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const ev = eventCode ? await titleSponsorEvent(eventCode, viewer) : null;
      const res = ev ?? (await titleSponsorSeason(viewer));
      if (alive) setTs(res);
    })();
    return () => { alive = false; };
  }, [viewer, eventCode]);
  return ts;
}
