import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { neutrals, hues } from "@nmao/design-tokens";
import { supabase } from "./lib/supabase";
import Login from "./screens/Login";
import Compete from "./screens/Compete";
import Duel from "./screens/Duel";
import Achievements from "./screens/Achievements";
import Leaderboard from "./screens/Leaderboard";
import Home from "./screens/Home"; // serves as the Profile hub for now (rating, tasks, reveal)
import { Header } from "./components/Header";

// 5-tab shell (spec §1): Compete · Duel · Achievements · Leaderboard · Profile.
// Alerts = header bell (not a tab). App opens on Duel (the Arena).
// Compete + Profile keep their own internal headers for now; the shared Header
// rides above the new tabs. (Header + bell unify onto every tab as we rebuild them.)
type Tab = "compete" | "duel" | "achievements" | "leaderboard" | "profile";

const TABS: { key: Tab; label: string; title: string; ownHeader?: boolean }[] = [
  { key: "compete", label: "Compete", title: "Compete", ownHeader: true },
  { key: "duel", label: "Duel", title: "The Arena" },
  { key: "achievements", label: "Achieve", title: "Achievements" },
  { key: "leaderboard", label: "Ranks", title: "Leaderboard" },
  { key: "profile", label: "Profile", title: "Profile", ownHeader: true },
];

function MainTabs() {
  const [tab, setTab] = useState<Tab>("duel");
  const active = TABS.find((t) => t.key === tab)!;
  return (
    <View style={{ flex: 1 }}>
      {!active.ownHeader ? <Header title={active.title} unread={3} onBell={() => { /* TODO: alerts sheet (§7) */ }} /> : null}

      <View style={{ flex: 1 }}>
        {tab === "compete" ? <Compete /> : null}
        {tab === "duel" ? <Duel /> : null}
        {tab === "achievements" ? <Achievements /> : null}
        {tab === "leaderboard" ? <Leaderboard /> : null}
        {tab === "profile" ? <Home onCompete={() => setTab("compete")} /> : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: neutrals.border,
          backgroundColor: "#0b0b0c",
          paddingTop: 8,
          paddingBottom: 26,
        }}
      >
        {TABS.map((t) => (
          <TabButton key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
      <View
        style={{
          height: 2,
          width: 18,
          borderRadius: 2,
          backgroundColor: active ? hues.gold.hi : "transparent",
          marginBottom: 6,
        }}
      />
      <Text style={{ color: active ? hues.gold.hi : neutrals.muted2, fontWeight: active ? "800" : "500", fontSize: 11, letterSpacing: 0.3 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <StatusBar style="light" />
      {session === undefined ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={neutrals.muted} />
        </View>
      ) : session ? (
        <MainTabs />
      ) : (
        <Login />
      )}
    </View>
  );
}
