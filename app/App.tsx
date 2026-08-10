import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { neutrals, hues } from "@nmao/design-tokens";
import { supabase } from "./lib/supabase";
import Login from "./screens/Login";
import Home from "./screens/Home";
import Compete from "./screens/Compete";

type Tab = "home" | "compete";

function MainTabs() {
  const [tab, setTab] = useState<Tab>("home");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === "home" ? <Home onCompete={() => setTab("compete")} /> : <Compete />}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: neutrals.border, backgroundColor: "#0b0b0c", paddingTop: 10, paddingBottom: 26 }}>
        <TabButton label="Home" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton label="Compete" active={tab === "compete"} onPress={() => setTab("compete")} />
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ color: active ? hues.gold.hi : neutrals.muted2, fontWeight: active ? "700" : "500", fontSize: 13 }}>{label}</Text>
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
