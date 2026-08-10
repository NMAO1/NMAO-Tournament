import { supabase } from "./supabase";

export type MyCompetitor = {
  id: string; first_name: string; last_name: string; declared_rank: string | null; dob: string;
};

// The competitors the signed-in user actually IS: their own profile
// (auth_user_id) plus any children they guardian. We scope explicitly rather
// than trusting RLS — a user who is also staff/judge can read every competitor,
// and the app must still only show THEIR athletes.
export async function myCompetitors(): Promise<MyCompetitor[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return [];

  const cols = "id, first_name, last_name, declared_rank, dob";
  const { data: own } = await supabase.from("competitors").select(cols).eq("auth_user_id", uid);

  const { data: links } = await supabase
    .from("guardian_competitors")
    .select("competitor_id, guardians!inner(auth_user_id)")
    .eq("guardians.auth_user_id", uid);
  const wardIds = (links ?? []).map((l: { competitor_id: string }) => l.competitor_id);
  let wards: MyCompetitor[] = [];
  if (wardIds.length) {
    const { data } = await supabase.from("competitors").select(cols).in("id", wardIds);
    wards = (data ?? []) as MyCompetitor[];
  }

  const byId = new Map<string, MyCompetitor>();
  for (const c of [...((own ?? []) as MyCompetitor[]), ...wards]) byId.set(c.id, c);
  return [...byId.values()].sort((a, b) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
}
