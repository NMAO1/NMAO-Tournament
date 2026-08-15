import { useEffect, useState, type ReactNode } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Switch } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { supabase } from "../lib/supabase";
import { myCompetitors } from "../lib/competitors";
import { loadProfile, loadNotifPrefs, setNotifPref, type ProfileInfo } from "../lib/profile";
import Journal from "./Journal";
import Home from "./Home";

type Sub = null | "journal" | "home" | "dojo" | "rules" | "notifs" | "store";
const RANK = (r: string | null) => (r ? r.replace("_", " ") : "");

const NOTIF_TYPES = [
  { type: "challenge_received", label: "New challenges" },
  { type: "duel_result", label: "Duel results" },
  { type: "sudden_death", label: "Sudden death" },
  { type: "upload_reminder", label: "Upload reminders" },
  { type: "voting_closing", label: "Voting closing" },
  { type: "reveal_ready", label: "Monthly reveal" },
];

export default function Profile() {
  const [me, setMe] = useState<string | null>(null);
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [sub, setSub] = useState<Sub>(null);

  useEffect(() => { (async () => { const id = (await myCompetitors())[0]?.id ?? null; setMe(id); if (id) setInfo(await loadProfile(id)); })(); }, []);

  if (sub === "journal" && me) return <Journal competitorId={me} onClose={() => setSub(null)} />;
  if (sub === "home") return <Home onCompete={() => setSub(null)} />;
  if (sub === "notifs" && me) return <NotifPanel competitorId={me} onBack={() => setSub(null)} />;
  if (sub === "dojo") return <Panel title="My Dojo" onBack={() => setSub(null)}>{info?.school ? <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "700" }}>{info.school.name}</Text> : <Text style={{ color: neutrals.muted2 }}>No school linked yet.</Text>}</Panel>;
  if (sub === "rules") return <Panel title="Rules & Help" onBack={() => setSub(null)}><RulesText /></Panel>;
  if (sub === "store") return <Panel title="Membership & Store" onBack={() => setSub(null)}><Text style={{ color: neutrals.muted, lineHeight: 20 }}>The Duelist membership ($3.99) and season-pass frames arrive here soon.</Text></Panel>;

  if (!info) return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;

  const initials = `${info.firstName?.[0] ?? ""}${info.lastName?.[0] ?? ""}`.toUpperCase();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 34 }}>
      {/* header */}
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Frame rarity="legendary" size="mini" radius={999}>
          <View style={{ width: 84, height: 84, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
            {info.photo ? <Image source={{ uri: info.photo }} style={{ width: 84, height: 84 }} /> : <Text style={{ color: hues.gold.hi, fontSize: 28, fontWeight: "800" }}>{initials}</Text>}
          </View>
        </Frame>
        <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "800", marginTop: 12 }}>{info.firstName}{info.lastName ? ` ${info.lastName[0]}.` : ""}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 12, textTransform: "capitalize" }}>{[RANK(info.rank), info.style, info.school?.name].filter(Boolean).join(" · ")}</Text>
        <View style={{ flexDirection: "row", marginTop: 14 }}>
          <Stat v={info.rating != null ? String(info.rating) : "—"} l="Rating" />
          <Stat v={String(info.wins)} l="Duel wins" />
          <Stat v={String(info.streak)} l="Streak" />
        </View>
      </View>

      <Row icon="📓" label="Journal" onPress={() => setSub("journal")} />
      <Row icon="🥋" label="My Dojo" onPress={() => setSub("dojo")} />
      <Row icon="🔔" label="Notifications" onPress={() => setSub("notifs")} />
      <Row icon="✦" label="Membership & Store" onPress={() => setSub("store")} />
      <Row icon="📖" label="Rules & Help" onPress={() => setSub("rules")} />
      <Row icon="🏆" label="Tournament & entries" onPress={() => setSub("home")} />

      <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ marginTop: 18, alignItems: "center" }}>
        <Text style={{ color: neutrals.muted, fontSize: 13 }}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <View style={{ alignItems: "center", marginHorizontal: 16 }}>
      <Text style={{ color: hues.gold.hi, fontSize: 20, fontWeight: "800" }}>{v}</Text>
      <Text style={{ color: neutrals.muted2, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 3 }}>{l}</Text>
    </View>
  );
}
function Row({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 15, paddingHorizontal: 14, marginBottom: 8, borderRadius: 12, backgroundColor: neutrals.surface, borderWidth: 1, borderColor: neutrals.border }}>
      <Text style={{ fontSize: 16, marginRight: 12 }}>{icon}</Text>
      <Text style={{ color: neutrals.text, fontSize: 14, fontWeight: "600", flex: 1 }}>{label}</Text>
      <Text style={{ color: neutrals.muted2, fontSize: 18 }}>›</Text>
    </TouchableOpacity>
  );
}

function Panel({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}><Text style={{ color: neutrals.muted, fontSize: 22 }}>‹</Text></TouchableOpacity>
        <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>{title}</Text>
      </View>
      {children}
    </ScrollView>
  );
}

function NotifPanel({ competitorId, onBack }: { competitorId: string; onBack: () => void }) {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  useEffect(() => { loadNotifPrefs().then((list) => { const m: Record<string, boolean> = {}; list.forEach((p) => (m[p.type] = p.enabled)); setPrefs(m); }); }, []);
  async function toggle(type: string, next: boolean) {
    setPrefs((p) => ({ ...(p ?? {}), [type]: next }));
    await setNotifPref(competitorId, type, next);
  }
  return (
    <Panel title="Notifications" onBack={onBack}>
      <Text style={{ color: neutrals.muted2, fontSize: 12, marginBottom: 14 }}>Choose what reaches you. Guardian-adjustable.</Text>
      {prefs == null ? <ActivityIndicator color={neutrals.muted} /> : NOTIF_TYPES.map((n) => {
        const on = prefs[n.type] !== false;
        return (
          <View key={n.type} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: neutrals.border }}>
            <Text style={{ color: neutrals.text, fontSize: 14 }}>{n.label}</Text>
            <Switch value={on} onValueChange={(v) => toggle(n.type, v)} trackColor={{ true: hues.gold.shadow, false: neutrals.border }} thumbColor={on ? hues.gold.base : neutrals.muted2} />
          </View>
        );
      })}
    </Panel>
  );
}

function RulesText() {
  const lines = [
    "Same monthly password on your unedited form.",
    "Watch both forms for 15s before you can vote.",
    "The tally stays hidden until a duel closes.",
    "4 duels per week; opponents match your rank & age.",
    "Badges & medals reveal at the monthly ceremony.",
    "Every effort counts — win or learn, then compete again.",
  ];
  return <View>{lines.map((l, i) => <Text key={i} style={{ color: neutrals.muted, fontSize: 13, lineHeight: 22, marginBottom: 4 }}>•  {l}</Text>)}</View>;
}
