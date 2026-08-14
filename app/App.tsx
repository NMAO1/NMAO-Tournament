import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Modal } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { neutrals, hues } from "@nmao/design-tokens";
import { supabase } from "./lib/supabase";
import { myCompetitors } from "./lib/competitors";
import { unreadCount, subscribeNotifications, latestUnseenMonthly, type Notif } from "./lib/notifications";
import Login from "./screens/Login";
import Compete from "./screens/Compete";
import Duel from "./screens/Duel";
import Achievements from "./screens/Achievements";
import Leaderboard from "./screens/Leaderboard";
import Profile from "./screens/Profile";
import DuelReveal from "./screens/DuelReveal";
import MonthlyReveal from "./screens/MonthlyReveal";
import { Header } from "./components/Header";
import { AlertsSheet } from "./components/AlertsSheet";

// 5-tab shell (spec §1): Compete · Duel · Achievements · Leaderboard · Profile.
// Alerts = header bell (not a tab). App opens on Duel (the Arena).
type Tab = "compete" | "duel" | "achievements" | "leaderboard" | "profile";
type ActiveReveal = { kind: "duel"; duelId: string } | { kind: "monthly"; period: string; payload: Record<string, unknown> };

const TABS: { key: Tab; label: string; title: string; ownHeader?: boolean }[] = [
  { key: "compete", label: "Compete", title: "Compete", ownHeader: true },
  { key: "duel", label: "Duel", title: "The Arena" },
  { key: "achievements", label: "Achieve", title: "Achievements" },
  { key: "leaderboard", label: "Ranks", title: "Leaderboard" },
  { key: "profile", label: "Profile", title: "Profile", ownHeader: true },
];

function MainTabs() {
  const [tab, setTab] = useState<Tab>("duel");
  const [myId, setMyId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [reveal, setReveal] = useState<ActiveReveal | null>(null);
  const active = TABS.find((t) => t.key === tab)!;

  useEffect(() => {
    (async () => {
      const comps = await myCompetitors();
      setMyId(comps[0]?.id ?? null);
      setUnread(await unreadCount());
      const m = await latestUnseenMonthly();
      if (m) setReveal({ kind: "monthly", period: m.period, payload: m.payload }); // auto-detect on launch (§8b)
    })();
    const unsub = subscribeNotifications(() => { unreadCount().then(setUnread); });
    return unsub;
  }, []);

  function routeNotif(n: Notif) {
    setAlertsOpen(false);
    const duelId = typeof n.data?.duel_id === "string" ? (n.data.duel_id as string) : null;
    if (n.type === "reveal_ready") { latestUnseenMonthly().then((m) => m && setReveal({ kind: "monthly", period: m.period, payload: m.payload })); return; }
    if (duelId && n.type === "duel_result") { setReveal({ kind: "duel", duelId }); return; }
    if (duelId) { setTab("duel"); }
  }

  return (
    <View style={{ flex: 1 }}>
      {!active.ownHeader ? <Header title={active.title} unread={unread} onBell={() => setAlertsOpen(true)} /> : null}

      <View style={{ flex: 1 }}>
        {tab === "compete" ? <Compete /> : null}
        {tab === "duel" ? <Duel /> : null}
        {tab === "achievements" ? <Achievements /> : null}
        {tab === "leaderboard" ? <Leaderboard /> : null}
        {tab === "profile" ? <Profile /> : null}
      </View>

      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: neutrals.border, backgroundColor: "#0b0b0c", paddingTop: 8, paddingBottom: 26 }}>
        {TABS.map((t) => (
          <TabButton key={t.key} label={t.label} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>

      <AlertsSheet visible={alertsOpen} onClose={() => setAlertsOpen(false)} onSelect={routeNotif} />

      <Modal visible={!!reveal} animationType="fade" onRequestClose={() => setReveal(null)}>
        {reveal?.kind === "duel" ? <DuelReveal duelId={reveal.duelId} myId={myId} onClose={() => setReveal(null)} /> : null}
        {reveal?.kind === "monthly" ? <MonthlyReveal period={reveal.period} payload={reveal.payload} onClose={() => setReveal(null)} /> : null}
      </Modal>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
      <View style={{ height: 2, width: 18, borderRadius: 2, backgroundColor: active ? hues.gold.hi : "transparent", marginBottom: 6 }} />
      <Text style={{ color: active ? hues.gold.hi : neutrals.muted2, fontWeight: active ? "800" : "500", fontSize: 11, letterSpacing: 0.3 }}>{label}</Text>
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
