import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, tierHue, metalStops } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { myCompetitors, MyCompetitor as Competitor } from "../lib/competitors";
import Reveal, { RevealResult } from "./Reveal";
type Entry = { event: string; age_bracket: string; status: string; created_at: string };

const EVENT_NAME: Record<string, string> = {
  trad_forms: "Traditional Forms", trad_weapons: "Traditional Weapons",
  open_forms: "Open Forms", open_weapons: "Open Weapons",
};
const RANK_LABEL: Record<string, string> = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", black_belt: "Black Belt",
};
const prettyBracket = (b: string) => b.replace("_plus", "+").replace("_", "–");

export default function Home({ onCompete }: { onCompete: () => void }) {
  const [comp, setComp] = useState<Competitor | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [provisional, setProvisional] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RevealResult | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    (async () => {
      const comps = await myCompetitors();
      const c = comps[0];
      if (!c) { setLoading(false); return; }
      setComp(c);
      const [{ data: sr }, { data: es }] = await Promise.all([
        supabase.from("skill_ratings").select("rating, provisional").eq("competitor_id", c.id).maybeSingle(),
        supabase.from("entries").select("event, age_bracket, status, created_at").eq("competitor_id", c.id).order("created_at", { ascending: false }),
      ]);
      if (sr) { setRating(Number((sr as { rating: number }).rating)); setProvisional(!!(sr as { provisional: boolean }).provisional); }
      setEntries((es ?? []) as Entry[]);

      // Latest finalized result → powers the Reveal ceremony.
      const { data: res } = await supabase
        .from("results")
        .select("entry_id, placement, rating_delta, rating_after, entries!inner(event, competitor_id)")
        .eq("entries.competitor_id", c.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (res) {
        const r = res as { entry_id: string; placement: number | null; rating_delta: number; rating_after: number; entries: { event: string } | { event: string }[] };
        const after = Number(r.rating_after), d = Number(r.rating_delta);
        const entry = Array.isArray(r.entries) ? r.entries[0] : r.entries;
        const { data: medal } = await supabase.from("medals").select("medal_type").eq("entry_id", r.entry_id).maybeSingle();
        setResult({ placement: r.placement, before: after - d, after, delta: d, event: entry.event, medalType: medal ? (medal as { medal_type: string }).medal_type : null });
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;
  }
  if (!comp) {
    return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 26 }}>
      <Text style={{ color: neutrals.muted, textAlign: "center" }}>No competitor profile is linked to this account yet.</Text>
      <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ marginTop: 16 }}><Text style={{ color: neutrals.muted2 }}>Sign out</Text></TouchableOpacity>
    </View>;
  }

  if (revealing && result) return <Reveal result={result} competitorId={comp.id} onDone={() => setRevealing(false)} />;

  const rank = comp.declared_rank ?? "beginner";
  const hueKey = (((tierHue as Record<string, keyof typeof hues>)[rank]) ?? "gold") as keyof typeof hues;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <View>
          <Text style={{ color: neutrals.muted, fontSize: 14 }}>Welcome back,</Text>
          <Text style={{ color: neutrals.text, fontSize: 28, fontWeight: "700" }}>{comp.first_name} {comp.last_name}</Text>
        </View>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}><Text style={{ color: neutrals.muted, fontSize: 13 }}>Sign out</Text></TouchableOpacity>
      </View>

      {result ? (
        <TouchableOpacity onPress={() => setRevealing(true)} activeOpacity={0.85} style={{ marginBottom: 18 }}>
          <LinearGradient colors={["#FF2E3B", "#A32BF7", "#1F7BFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ borderRadius: 14, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Your result is in</Text>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }}>Tap to reveal your placement</Text>
            </View>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>›</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: neutrals.border, marginBottom: 24 }}>
        <LinearGradient colors={metalStops(hueKey)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
          <Text style={{ color: "rgba(0,0,0,0.62)", fontWeight: "800", letterSpacing: 1.6, fontSize: 12, textTransform: "uppercase" }}>{RANK_LABEL[rank] ?? rank}</Text>
          <Text style={{ color: "#0c0c0c", fontSize: 14, marginTop: 8, fontWeight: "600" }}>Rating</Text>
          <Text style={{ color: "#0c0c0c", fontSize: 54, fontWeight: "800", marginTop: -2 }}>{rating != null ? Math.round(rating) : "—"}</Text>
          {provisional ? <Text style={{ color: "rgba(0,0,0,0.6)", fontSize: 12, marginTop: 2 }}>Provisional — a few more rounds to lock it in</Text> : null}
        </LinearGradient>
      </View>

      <Text style={{ color: neutrals.muted2, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 12 }}>Your Entries</Text>
      {entries.length === 0 ? (
        <View style={{ backgroundColor: neutrals.surface, borderWidth: 1, borderColor: neutrals.border, borderRadius: 14, padding: 18 }}>
          <Text style={{ color: neutrals.text, fontWeight: "600", marginBottom: 4 }}>No entries yet</Text>
          <Text style={{ color: neutrals.muted2, fontSize: 13, marginBottom: 14 }}>Submit a video to compete in the open round.</Text>
          <TouchableOpacity onPress={onCompete} activeOpacity={0.85}>
            <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ borderRadius: 11, paddingVertical: 13, alignItems: "center" }}>
              <Text style={{ color: "#141210", fontWeight: "800" }}>Enter the arena</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : entries.map((e, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: neutrals.surface, borderWidth: 1, borderColor: neutrals.border, borderRadius: 14, padding: 16, marginBottom: 10 }}>
          <View>
            <Text style={{ color: neutrals.text, fontWeight: "600", fontSize: 15 }}>{EVENT_NAME[e.event] ?? e.event}</Text>
            <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 3 }}>{prettyBracket(e.age_bracket)}</Text>
          </View>
          <View style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(230,185,63,0.12)", borderWidth: 1, borderColor: hues.gold.shadow }}>
            <Text style={{ color: hues.gold.hi, fontSize: 11, fontWeight: "700", textTransform: "capitalize" }}>{e.status}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
