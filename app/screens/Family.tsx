import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { useActiveCompetitor } from "../lib/activeCompetitor";
import Onboard from "./Onboard";

const RANK_LABEL: Record<string, string> = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", black_belt: "Black Belt",
};

// Family hub — a guardian manages every competitor on their account here: see who's
// on the account, switch the active child (drives all tabs), and add another.
export default function Family({ onBack }: { onBack: () => void }) {
  const { comps, activeId, setActive, reload } = useActiveCompetitor();
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <Onboard
        mode="add"
        onCancel={() => setAdding(false)}
        onDone={async (id) => { await reload(); if (id) setActive(id); setAdding(false); }}
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "800" }}>My Competitors</Text>
        <TouchableOpacity onPress={onBack}><Text style={{ color: neutrals.muted2, fontSize: 14 }}>Done</Text></TouchableOpacity>
      </View>
      <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
        {comps.length > 1
          ? "Tap a competitor to make them active — the whole app (Compete, Duel, Honors, Leaderboard) follows your selection."
          : "Add each child you manage. You can switch between them any time, and the whole app follows the one you pick."}
      </Text>

      {comps.map((c) => {
        const on = c.id === activeId;
        const rank = c.declared_rank ? (RANK_LABEL[c.declared_rank] ?? c.declared_rank) : null;
        const suspended = (c.status ?? "active") !== "active";
        return (
          <TouchableOpacity key={c.id} onPress={() => setActive(c.id)} activeOpacity={0.85}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 15, borderRadius: 14, marginBottom: 10,
              backgroundColor: on ? "rgba(230,185,63,0.10)" : neutrals.surface, borderWidth: 1, borderColor: on ? hues.gold.base : neutrals.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: on ? hues.gold.base : neutrals.surface2, borderWidth: 1, borderColor: on ? hues.gold.base : neutrals.border, alignItems: "center", justifyContent: "center", marginRight: 13 }}>
                <Text style={{ color: on ? "#141210" : neutrals.muted, fontWeight: "800", fontSize: 16 }}>{(c.first_name?.[0] ?? "?").toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 16 }}>{c.first_name} {c.last_name}</Text>
                <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2 }}>
                  {[rank, suspended ? "Suspended" : null].filter(Boolean).join(" · ") || "Competitor"}
                </Text>
              </View>
            </View>
            {on
              ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: hues.gold.base }}><Text style={{ color: "#141210", fontSize: 11, fontWeight: "800" }}>Active</Text></View>
              : <Text style={{ color: neutrals.muted2, fontSize: 13 }}>Switch</Text>}
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity onPress={() => setAdding(true)} activeOpacity={0.85} style={{ marginTop: 10, borderRadius: 12, overflow: "hidden" }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 14, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>+ Add a competitor</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}
