import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Single source of truth for the "current season" label shown across the app
// (Arena, vote queue, reveals, Achievements). Reads the live active season from
// the seasons table — NOT a hardcoded "Season 1 · Round VIII" (which drifted and
// was wrong: the active season is currently "Pre-Season (Test)"). Duels aren't
// tied to tournament round numbers, so we show the season name, not a round.
let _cache: string | null | undefined;

export async function fetchActiveSeasonName(): Promise<string | null> {
  if (_cache !== undefined) return _cache ?? null;
  const { data } = await supabase
    .from("seasons").select("name")
    .eq("status", "active")
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  const raw = (data as { name: string } | null)?.name ?? null;
  // Public display strips an internal "(Test)" marker — competitors see
  // "Pre-Season", while staff surfaces (Mission Control) keep the raw name.
  _cache = raw ? raw.replace(/\s*\(test\)\s*$/i, "").trim() : null;
  return _cache;
}

// React hook — returns the active season name (empty string while loading or if
// there's no active season, so nothing fake is ever shown).
export function useSeasonLabel(): string {
  const [name, setName] = useState<string>(_cache ?? "");
  useEffect(() => { fetchActiveSeasonName().then((n) => { if (n) setName(n); }); }, []);
  return name;
}
