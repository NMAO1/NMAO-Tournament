import { useEffect, useState, type ReactNode } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, Switch } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { supabase } from "../lib/supabase";
import { myCompetitors } from "../lib/competitors";
import { loadProfile, loadNotifPrefs, setNotifPref, type ProfileInfo } from "../lib/profile";
import Journal from "./Journal";
import Home from "./Home";
import BuyEntry from "./BuyEntry";
import FrameLab from "./FrameLab";
import Store from "./Store";

type Sub = null | "journal" | "home" | "dojo" | "rules" | "notifs" | "store" | "shop" | "framelab";
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
  if (sub === "framelab") return <FrameLab onBack={() => setSub(null)} />;
  if (sub === "store" && me) return <BuyEntry competitorId={me} onClose={() => setSub(null)} onPaid={() => setSub(null)} />;
  if (sub === "shop") return <Store onBack={() => setSub(null)} />;

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
      <Row icon="✦" label="Tournament entry & plans" onPress={() => setSub("store")} />
      <Row icon="🛒" label="Store" onPress={() => setSub("shop")} />
      <Row icon="📖" label="Rules & Help" onPress={() => setSub("rules")} />
      <Row icon="✨" label="Frame Lab (preview)" onPress={() => setSub("framelab")} />
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
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 11, paddingHorizontal: 11, marginBottom: 9, borderRadius: 16, backgroundColor: neutrals.surface, borderWidth: 1, borderColor: neutrals.border }}>
      {/* bento icon chip */}
      <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#15130f", borderWidth: 1, borderColor: neutrals.border, marginRight: 12 }}>
        <Text style={{ fontSize: 17 }}>{icon}</Text>
      </View>
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

type RuleItem = { label?: string; text: string };
const RULES: { title: string; items: RuleItem[] }[] = [
  {
    title: "Dueling",
    items: [
      { text: "Same monthly password on your unedited form." },
      { text: "Watch both forms for 15s before you can vote." },
      { text: "The tally stays hidden until a duel closes." },
      { text: "4 duels per week; opponents match your rank & age." },
      { text: "Badges & medals reveal at the monthly ceremony." },
      { text: "Every effort counts — win or learn, then compete again." },
    ],
  },
  {
    title: "Ratings & ranking",
    items: [
      { text: "You carry two separate scores — a Dueling rating and a Tournament skill rating. They never mix." },
      { label: "Dueling rating", text: "An Elo-style number that starts at 1200. Each duel the community vote picks a winner: the winner's rating rises and the loser's falls by the same amount." },
      { label: "How much it swings", text: "Beating a higher-rated opponent earns more; beating a lower-rated one earns less — up to 32 points a duel. Draws, deadlocks and forfeits don't move your rating." },
      { label: "Matchmaking", text: "Opponents are drawn at random from competitors near your rating, in your rank and age bracket — so every duel is a fair test." },
      { label: "Dueling leaderboard", text: "Ranks everyone by rating, then by wins; win streaks are tracked on their own." },
      { label: "Tournament skill rating", text: "A 0–100 number that starts at 50. Each round, judges score your form on the six-criterion rubric and your rating moves up or down against the competitors you're measured with." },
      { label: "Placings", text: "Medals and placings come from the judges' scores within your division; your skill rating is the season-long thread that carries between rounds." },
      { text: "Every rating change is recorded, so your progress is always auditable." },
    ],
  },
  {
    title: "Tournament categories",
    items: [
      { label: "Open Traditional Forms", text: "Unaltered forms from hard and soft styles — Karate, Kenpo/Kempo, Taekwondo, Tang Soo Do, Shotokan, Wushu and their derivatives. Presented without alteration. No inversions or flips." },
      { label: "Open Creative Forms", text: "Traditional or modern forms; at least 2/3 of the moves must be martial-arts techniques. Inversions, flips, jumps and spins allowed. Judged on technique, skill, balance, power, speed and style. No music." },
      { label: "Open Traditional Weapons", text: "Unaltered historical weapon forms — sword, jo staff, bo staff, spear, nunchucks, sai, kama, escrima. No flips or inversions. No music." },
      { label: "Open Creative Weapons", text: "Any weapon, traditional or modern; most of the routine must be martial-arts technique. Inversions, flips, jumps and spins allowed. No music. No sharp weapons." },
    ],
  },
  {
    title: "Video submission",
    items: [
      { label: "Location", text: "Film submissions from the same school in a consistent location." },
      { label: "Two angles", text: "Record front and side — two devices, or film the form twice (once front, once side)." },
      { label: "Stability", text: "Keep the camera steady on a tripod or stable surface." },
      { label: "Unedited", text: "Footage must be unedited start to finish — no cuts." },
      { label: "Lighting", text: "Well-lit; avoid shadows or glare that obscure the movement." },
      { label: "Audio", text: "Clear audio, free of distortion or background noise." },
      { label: "Duration", text: "30 seconds to 2 minutes, including any intro." },
      { label: "Performance area", text: "Clear of obstacles; no posters, text, branding or images." },
      { label: "Full body", text: "Keep your entire body in frame throughout the form." },
      { label: "Format", text: "Follow the specified file type, resolution and size." },
      { label: "Display info", text: "Before your form, show your name, date, event category and the tournament password on screen." },
    ],
  },
  {
    title: "Uniform",
    items: [
      { label: "Color", text: "Black or white uniform — your choice; it doesn't affect scoring." },
      { label: "Patches", text: "A small school patch on the left chest; up to 3 country flags (left shoulder, right shoulder, under back of neck)." },
      { label: "Condition", text: "Clean and in good repair — not torn or excessively worn." },
      { label: "Sleeves", text: "May be rolled to 3/4 or just below the elbow — neat and even on both sides." },
      { label: "Pants", text: "Long enough to cover the lower shin, short enough to clear the feet and ankle." },
      { label: "Belt", text: "Wear your current rank belt, tied snugly; ends roughly even and not past mid-thigh." },
      { label: "Footwear", text: "Barefoot, unless a health or medical need requires footwear (black or white, non-marking)." },
      { label: "Jewelry", text: "No watches, bracelets, necklaces or earrings during competition — for safety." },
    ],
  },
  {
    title: "Age rule",
    items: [
      { text: "Compete in the age division for your age as of the tournament date; if your birthday falls on event day, compete in the corresponding division." },
      { text: "Handle your weapon with control — reckless handling may be disqualified." },
      { text: "Don't submit a video with a dropped weapon, or one that strikes an object or wall — it will be disqualified." },
      { text: "Advanced competitors submit two different forms (no repeats): the first is judged in the preliminary round, the second when advancing or as a tie-breaker." },
    ],
  },
];

function RulesText() {
  return (
    <View>
      {RULES.map((sec) => (
        <View key={sec.title} style={{ marginBottom: 22 }}>
          <Text style={{ color: hues.gold.hi, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "800", marginBottom: 10 }}>{sec.title}</Text>
          {sec.items.map((it, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 8 }}>
              <Text style={{ color: hues.gold.base, fontSize: 13, marginRight: 8, lineHeight: 20 }}>•</Text>
              <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 20, flex: 1 }}>
                {it.label ? <Text style={{ color: neutrals.text, fontWeight: "700" }}>{it.label}: </Text> : null}{it.text}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={{ color: neutrals.muted2, fontSize: 12, fontStyle: "italic", lineHeight: 18 }}>
        Your uniform should never distract from your performance — it should enhance it by showing respect for the art and its traditions.
      </Text>
    </View>
  );
}
