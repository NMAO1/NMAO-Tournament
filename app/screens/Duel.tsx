import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { myCompetitors } from "../lib/competitors";
import { uploadDuelVideo } from "../lib/upload";
import {
  weekStatus, myActiveDuels, voteQueue, requestDuel, duelEvents, respondToDuel, submitDuelVideo,
  type WeekStatus, type ActiveDuel, type QueueDuel, type DuelEvent,
} from "../lib/duel";
import Arena from "./Arena";

const EXPORT_PRESET = ImagePicker.VideoExportPreset.H264_1920x1080;
const prettyErr = (e?: string) => (e ? e.replace(/^.*?:\s*/, "") : "Please try again.");

// The Duel hub — two sections: COMPETE (challenge + your active duels) and the
// VOTE QUEUE. Tapping a queue card rotates into the Arena ring.
export default function Duel() {
  const [me, setMe] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekStatus | null>(null);
  const [active, setActive] = useState<ActiveDuel[]>([]);
  const [queue, setQueue] = useState<QueueDuel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openDuel, setOpenDuel] = useState<string | null>(null);
  const [challenging, setChallenging] = useState(false);
  const [events, setEvents] = useState<DuelEvent[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const [w, a, q] = await Promise.all([weekStatus(id), myActiveDuels(id), voteQueue(id, "")]);
    setWeek(w); setActive(a); setQueue(q);
  }, []);

  useEffect(() => {
    (async () => {
      const comps = await myCompetitors();
      const id = comps[0]?.id ?? null;
      setMe(id);
      if (id) await load(id);
      setLoading(false);
    })();
  }, [load]);

  async function refresh() { if (!me) return; setRefreshing(true); await load(me); setRefreshing(false); }
  async function runSearch(text: string) { setSearch(text); if (me) setQueue(await voteQueue(me, text.trim())); }

  async function openChallenge() { if (!me) return; setChallenging(true); if (events.length === 0) setEvents(await duelEvents()); }
  async function request(ev: DuelEvent) {
    if (!me) return;
    setBusyId(ev.code);
    const r = await requestDuel(me, ev.code);
    setBusyId(null);
    if (!r.ok) { Alert.alert("Find a match", prettyErr(r.error)); return; }
    setChallenging(false);
    await load(me);
    Alert.alert("You're matched", "A mystery opponent has been drawn — they have 48 hours to accept. Identities are revealed at the end.");
  }
  async function respond(d: ActiveDuel, accept: boolean) {
    setBusyId(d.id);
    const r = await respondToDuel(d.id, accept);
    setBusyId(null);
    if (!r.ok) Alert.alert("Duel", prettyErr(r.error));
    if (me) await load(me);
  }
  async function upload(d: ActiveDuel) {
    if (!me) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to upload your form."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], videoExportPreset: EXPORT_PRESET, videoMaxDuration: 150, quality: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setBusyId(d.id);
    try {
      const path = await uploadDuelVideo(me, d.id, { uri: a.uri, mimeType: a.mimeType, fileName: a.fileName });
      const r = await submitDuelVideo(d.id, me, path);
      if (!r.ok) throw new Error(prettyErr(r.error));
      Alert.alert("Submitted", r.result === "voting" ? "Both forms are in — the community is voting!" : "Your form is in. Waiting on your opponent.");
    } catch (e) {
      Alert.alert("Upload", e instanceof Error ? e.message : "Please try again.");
    }
    setBusyId(null);
    await load(me);
  }

  if (loading) return <Center><ActivityIndicator color={neutrals.muted} /></Center>;
  if (!me) return <Center><Text style={{ color: neutrals.muted, textAlign: "center" }}>No competitor profile is linked yet.</Text></Center>;

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: neutrals.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={neutrals.muted} />}
    >
      {week ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: neutrals.border, borderRadius: 10, backgroundColor: "rgba(230,185,63,0.06)", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 }}>
          <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "700" }}>
            {week.remaining} of {week.limit} duels left this week
          </Text>
          <View style={{ flexDirection: "row" }}>
            {Array.from({ length: week.limit }).map((_, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, marginLeft: 4, backgroundColor: i < week.remaining ? hues.gold.base : neutrals.border }} />
            ))}
          </View>
        </View>
      ) : null}

      <SectionLabel left="Your duels" right="S1 · Round VIII" />
      <TouchableOpacity onPress={openChallenge} activeOpacity={0.85} disabled={week?.remaining === 0}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: week?.remaining === 0 ? 0.5 : 1, marginBottom: 4 }}>
          <Text style={{ color: "#fff", fontWeight: "800", letterSpacing: 0.5 }}>⚔  Challenge</Text>
        </LinearGradient>
      </TouchableOpacity>
      {week?.remaining === 0 ? <Text style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginBottom: 6 }}>Weekly limit reached — resets soon.</Text> : null}

      {challenging ? (
        <View style={{ borderWidth: 1, borderColor: neutrals.border, borderRadius: 12, padding: 12, marginTop: 6, marginBottom: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 12 }}>Choose your event</Text>
            <TouchableOpacity onPress={() => setChallenging(false)}><Text style={{ color: neutrals.muted2, fontSize: 12 }}>Close</Text></TouchableOpacity>
          </View>
          <Text style={{ color: neutrals.muted2, fontSize: 11, marginBottom: 10 }}>We'll match you with a random opponent at your rank, age, and rating. You won't see who until the reveal.</Text>
          {events.length === 0 ? (
            <Text style={{ color: neutrals.muted2, fontSize: 12 }}>Loading events…</Text>
          ) : events.map((ev) => (
            <TouchableOpacity key={ev.code} onPress={() => request(ev)} disabled={busyId !== null} activeOpacity={0.85} style={{ marginBottom: 8, borderRadius: 10, overflow: "hidden", opacity: busyId !== null && busyId !== ev.code ? 0.5 : 1 }}>
              <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{ev.name}</Text>
                <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" }}>{busyId === ev.code ? "Matching…" : "Find match ›"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {active.map((d) => <ActiveCard key={d.id} d={d} busy={busyId === d.id} onRespond={respond} onUpload={upload} />)}
      {active.length === 0 && !challenging ? <Text style={{ color: neutrals.muted2, fontSize: 12, marginBottom: 4 }}>No active duels. Challenge a rival to begin.</Text> : null}

      <SectionLabel left="Vote queue" right={`${queue.length} waiting`} />
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: neutrals.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 }}>
        <Text style={{ color: neutrals.muted2, marginRight: 6 }}>⌕</Text>
        <TextInput value={search} onChangeText={runSearch} placeholder="Search a competitor or school…" placeholderTextColor={neutrals.muted2} style={{ flex: 1, color: neutrals.text, fontSize: 12, paddingVertical: 2 }} />
      </View>
      {queue.length === 0 ? (
        <Text style={{ color: neutrals.muted2, fontSize: 12 }}>The arena is quiet. Challenge someone from above.</Text>
      ) : queue.map((q) => <QueueCard key={q.duelId} q={q} onEnter={() => setOpenDuel(q.duelId)} />)}
    </ScrollView>

    <Modal
      visible={!!openDuel}
      animationType="fade"
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={() => setOpenDuel(null)}
    >
      {openDuel && me ? (
        <Arena duelId={openDuel} voterId={me} onClose={(voted) => { setOpenDuel(null); if (voted && me) load(me); }} />
      ) : null}
    </Modal>
    </>
  );
}

function subtitle(d: ActiveDuel): string {
  if (d.status === "pending") return d.role === "opponent" ? `mystery challenge · ${d.event}` : `awaiting response · ${d.event}`;
  if (d.status === "accepted") return d.myVideoIn ? "awaiting opponent's form" : `accepted · upload your ${d.event}`;
  return "live — the community is voting";
}

function ActiveCard({ d, busy, onRespond, onUpload }: { d: ActiveDuel; busy: boolean; onRespond: (d: ActiveDuel, a: boolean) => void; onUpload: (d: ActiveDuel) => void }) {
  const title = d.status === "pending" && d.role === "opponent" ? "⚔  Mystery challenger" : "vs Mystery opponent";
  return (
    <View style={{ borderWidth: 1, borderColor: neutrals.border, borderRadius: 12, backgroundColor: neutrals.surface, padding: 12, marginBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 13 }}>{title}</Text>
          <Text style={{ color: neutrals.muted2, fontSize: 10, marginTop: 2 }}>{subtitle(d)}</Text>
        </View>
        {d.status === "voting" ? <Text style={{ color: hues.sapphire.hi, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>● LIVE</Text> : null}
      </View>

      {d.status === "pending" && d.role === "opponent" ? (
        <View style={{ flexDirection: "row", marginTop: 10 }}>
          <TouchableOpacity onPress={() => onRespond(d, false)} disabled={busy} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: neutrals.border, alignItems: "center", marginRight: 8 }}>
            <Text style={{ color: neutrals.muted, fontWeight: "700", fontSize: 12 }}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRespond(d, true)} disabled={busy} style={{ flex: 1, borderRadius: 10, overflow: "hidden" }}>
            <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 11, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{busy ? "…" : "Accept"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      {d.status === "accepted" && !d.myVideoIn ? (
        <TouchableOpacity onPress={() => onUpload(d)} disabled={busy} style={{ marginTop: 10, borderRadius: 10, overflow: "hidden" }}>
          <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 11, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{busy ? "Uploading…" : "⬆ Upload your form"}</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function QueueCard({ q, onEnter }: { q: QueueDuel; onEnter: () => void }) {
  return (
    <TouchableOpacity onPress={onEnter} activeOpacity={0.85} style={{ borderWidth: 1, borderColor: neutrals.border, borderRadius: 12, backgroundColor: neutrals.surface, padding: 10, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <Frame rarity={q.challenger.frameRarity} size="mini"><View style={{ width: 108, height: 61, backgroundColor: "#171207" }} /></Frame>
        <View style={{ marginHorizontal: 8, width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#15130f", borderWidth: 1, borderColor: hues.gold.shadow }}>
          <Text style={{ color: hues.gold.hi, fontWeight: "900", fontStyle: "italic", fontSize: 13 }}>VS</Text>
        </View>
        <Frame rarity={q.opponent.frameRarity} size="mini"><View style={{ width: 108, height: 61, backgroundColor: "#120c1f" }} /></Frame>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <Text style={{ color: neutrals.text, fontSize: 11, fontWeight: "600", flex: 1 }} numberOfLines={1}>{q.challenger.name}</Text>
        <View style={{ marginHorizontal: 8, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(230,185,63,0.12)", borderWidth: 1, borderColor: hues.gold.base }}>
          <Text style={{ color: hues.gold.hi, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" }} numberOfLines={1}>{q.type}</Text>
        </View>
        <Text style={{ color: neutrals.text, fontSize: 11, fontWeight: "600", flex: 1, textAlign: "right" }} numberOfLines={1}>{q.opponent.name}</Text>
      </View>
      <Text style={{ color: hues.gold.hi, fontSize: 11, textAlign: "center", marginTop: 8, fontWeight: "700" }}>Tap to enter the ring ›</Text>
    </TouchableOpacity>
  );
}

function SectionLabel({ left, right }: { left: string; right: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
      <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800" }}>{left}</Text>
      <Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }}>{right}</Text>
    </View>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 26 }}>{children}</View>;
}
