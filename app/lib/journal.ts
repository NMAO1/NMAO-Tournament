import { supabase } from "./supabase";

// FULLY PRIVATE journal (own-login only, enforced by RLS via nmao.self_competitor_ids()).
// Prompts + freeform: reveals seed a contextual prompt; you can also write freely.

export type JournalEntry = { id: string; prompt: string | null; body: string; createdAt: string };

export async function listJournal(competitorId: string): Promise<JournalEntry[]> {
  const { data } = await supabase
    .from("journal_entries")
    .select("id, prompt, body, created_at")
    .eq("competitor_id", competitorId)
    .order("created_at", { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((e) => ({ id: e.id, prompt: e.prompt ?? null, body: e.body, createdAt: e.created_at }));
}

export async function addJournal(competitorId: string, body: string, prompt: string | null = null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("journal_entries").insert({ competitor_id: competitorId, body: body.trim(), prompt });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Curated reflection prompts, chosen by context. (Could move to a DB table later,
// like duel_reveal_messages, for tuning without an app release.)
export const JOURNAL_PROMPTS: Record<"win" | "loss" | "monthly" | "free", string[]> = {
  win: [
    "What worked in that duel — and how do you make it a habit?",
    "Name one thing you did well. How did it feel?",
    "The crowd backed you. What did they see?",
  ],
  loss: [
    "What will you sharpen before your next duel?",
    "What did your opponent do that you can learn from?",
    "Every effort teaches. What did this one teach you?",
  ],
  monthly: [
    "What did this month in the arena teach you?",
    "Where did you grow the most this season?",
    "What are you proud of — and what's next?",
  ],
  free: [
    "What's on your mind after today's training?",
    "What are you working toward right now?",
    "Write down one small win from today.",
  ],
};

export function promptFor(kind: keyof typeof JOURNAL_PROMPTS): string {
  const arr = JOURNAL_PROMPTS[kind];
  return arr[Math.floor(Math.random() * arr.length)];
}
