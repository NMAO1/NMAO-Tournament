import { supabase } from "./supabase";

export type Season = { id: string; name: string; status: string; starts_at: string | null };
export type School = { id: string; name: string };

export async function listSeasons(): Promise<Season[]> {
  const { data } = await supabase.from("seasons").select("id, name, status, starts_at").neq("status", "archived").order("starts_at", { ascending: true, nullsFirst: false });
  return (data ?? []) as Season[];
}

export async function listSchools(): Promise<School[]> {
  const { data } = await supabase.from("schools").select("id, name").order("name");
  return (data ?? []) as School[];
}

export type OnboardPayload = {
  guardian: { first_name: string; last_name: string; phone?: string };
  competitor: { first_name: string; last_name: string; dob: string; school_id?: string | null; declared_rank?: string; declared_style?: string };
  season_id: string;
  consent_types: string[];
};

export async function onboardCompetitor(payload: OnboardPayload): Promise<{ ok: boolean; competitor_id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("onboard-competitor", { body: payload });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; competitor_id?: string; error?: string };
}
