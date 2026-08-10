import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { neutrals, hues, metalStops, status } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { uploadEntryVideo, PickedVideo } from "../lib/upload";
import { myCompetitors } from "../lib/competitors";

// Export competition videos at 1080p H.264 (flip to H264_1280x720 for smaller
// files). MAX_MB guards the plan's Storage cap so an oversize clip gives a clear
// message instead of a server error — raise it when the project moves to Pro.
const EXPORT_PRESET = ImagePicker.VideoExportPreset.H264_1920x1080;
const MAX_MB = 500; // matches the entry-videos bucket ceiling (Pro plan)

type Competitor = { id: string; first_name: string; last_name: string; declared_rank: string | null; dob: string };
const EVENTS = [
  { code: "trad_forms", name: "Traditional Forms" },
  { code: "trad_weapons", name: "Traditional Weapons" },
  { code: "open_forms", name: "Open Forms" },
  { code: "open_weapons", name: "Open Weapons" },
];
const prettyBracket = (b: string) => b.replace("_plus", "+").replace("_", "–");

export default function Compete() {
  const [comps, setComps] = useState<Competitor[]>([]);
  const [competitorId, setCompetitorId] = useState<string | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [vid1, setVid1] = useState<PickedVideo | null>(null);
  const [vid2, setVid2] = useState<PickedVideo | null>(null);
  const [phase, setPhase] = useState<"idle" | "working">("idle");
  const [step, setStep] = useState("");
  const [done, setDone] = useState<{ event: string; age_bracket: string } | null>(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    (async () => {
      const rows = await myCompetitors();
      setComps(rows);
      if (rows.length === 1) setCompetitorId(rows[0].id);
    })();
  }, []);

  async function pick(slot: 1 | 2) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow video access to attach your entry."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      videoExportPreset: EXPORT_PRESET, // transcode to 1080p H.264 on export
      videoMaxDuration: 150,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const info = await FileSystem.getInfoAsync(a.uri);
    const sizeMb = info.exists && info.size ? info.size / (1024 * 1024) : 0;
    if (sizeMb > MAX_MB) {
      Alert.alert("Video too large", `This clip is ${Math.round(sizeMb)} MB — over the ${MAX_MB} MB limit. Trim it to a shorter form.`);
      return;
    }
    (slot === 1 ? setVid1 : setVid2)({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName });
  }

  const ready = !!competitorId && !!event && !!vid1 && phase === "idle";

  async function submit() {
    if (!competitorId || !event || !vid1) return;
    setPhase("working"); setStep("Uploading Angle 1…");
    try {
      const path1 = await uploadEntryVideo(competitorId, event, 1, vid1);
      let path2: string | null = null;
      if (vid2) { setStep("Uploading Angle 2…"); path2 = await uploadEntryVideo(competitorId, event, 2, vid2); }

      setStep("Registering your entry…");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-entry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ competitor_id: competitorId, event, video_path: path1, video_path_2: path2 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { throw new Error(j.error || "Could not submit your entry."); }
      setDone({ event: j.event, age_bracket: j.age_bracket });
    } catch (e: any) {
      Alert.alert("Entry not submitted", e?.message ?? "Please try again.");
    } finally {
      setPhase("idle"); setStep("");
    }
  }

  function reset() { setDone(null); setEvent(null); setVid1(null); setVid2(null); }

  if (done) {
    const ev = EVENTS.find((e) => e.code === done.event)?.name ?? done.event;
    return (
      <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 26 }}>
        <View style={{ width: 92, height: 92, borderRadius: 99, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: hues.gold.base }}>
          <Text style={{ color: hues.gold.hi, fontSize: 46, marginTop: -4 }}>✓</Text>
        </View>
        <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "700", marginTop: 22 }}>Entry submitted</Text>
        <Text style={{ color: neutrals.muted, fontSize: 15, marginTop: 6, textAlign: "center" }}>
          {ev} · {prettyBracket(done.age_bracket)}
        </Text>
        <Text style={{ color: neutrals.muted2, fontSize: 13, marginTop: 10, textAlign: "center" }}>
          Your video is in the queue. Judges will score it once the round closes.
        </Text>
        <TouchableOpacity onPress={reset} activeOpacity={0.85} style={{ marginTop: 26 }}>
          <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={{ borderRadius: 12, paddingVertical: 14, paddingHorizontal: 30 }}>
            <Text style={{ color: "#141210", fontWeight: "800", fontSize: 15 }}>Enter another event</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: neutrals.text, fontSize: 26, fontWeight: "700" }}>Compete</Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={{ color: neutrals.muted, fontSize: 13 }}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ color: neutrals.muted, fontSize: 14, marginBottom: 22 }}>Submit your entry for the open round.</Text>

      {loadErr ? <Text style={{ color: status.danger, marginBottom: 16 }}>{loadErr}</Text> : null}
      {comps.length === 0 && !loadErr ? (
        <Text style={{ color: neutrals.muted2, fontSize: 14 }}>No competitor profile is linked to this account yet.</Text>
      ) : null}

      {comps.length > 1 && (
        <Section label="Competitor">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {comps.map((c) => (
              <Chip key={c.id} active={competitorId === c.id} onPress={() => setCompetitorId(c.id)} label={`${c.first_name} ${c.last_name}`} />
            ))}
          </View>
        </Section>
      )}

      {competitorId && (
        <>
          <Section label="Event">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {EVENTS.map((e) => (
                <Chip key={e.code} active={event === e.code} onPress={() => setEvent(e.code)} label={e.name} />
              ))}
            </View>
          </Section>

          <Section label="Videos">
            <Text style={{ color: neutrals.muted2, fontSize: 12, marginBottom: 10 }}>
              Add up to two angles (front + side). Angle 1 is required. Exported at 1080p for crisp judging detail.
            </Text>
            <VideoSlot n={1} picked={vid1} onPick={() => pick(1)} onClear={() => setVid1(null)} required />
            <View style={{ height: 10 }} />
            <VideoSlot n={2} picked={vid2} onPick={() => pick(2)} onClear={() => setVid2(null)} />
          </Section>

          <TouchableOpacity onPress={submit} disabled={!ready} activeOpacity={0.85} style={{ marginTop: 24 }}>
            <LinearGradient colors={ready ? metalStops("gold") : [neutrals.surface2, neutrals.surface2, neutrals.surface2]}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ borderRadius: 13, paddingVertical: 16, alignItems: "center" }}>
              {phase === "working"
                ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color="#141210" /><Text style={{ color: "#141210", fontWeight: "800" }}>{step}</Text></View>
                : <Text style={{ color: ready ? "#141210" : neutrals.muted2, fontWeight: "800", fontSize: 16 }}>Submit Entry</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={{ color: neutrals.muted2, fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", marginBottom: 10 }}>{label}</Text>
      {children}
    </View>
  );
}
function Chip({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, borderWidth: 1,
        borderColor: active ? hues.gold.base : neutrals.border, backgroundColor: active ? "rgba(230,185,63,0.12)" : neutrals.surface }}>
      <Text style={{ color: active ? hues.gold.hi : neutrals.text, fontWeight: active ? "700" : "500", fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}
function VideoSlot({ n, picked, onPick, onClear, required }: { n: number; picked: PickedVideo | null; onPick: () => void; onClear: () => void; required?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: neutrals.surface, borderWidth: 1, borderColor: picked ? hues.gold.shadow : neutrals.border, borderRadius: 12, padding: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: neutrals.text, fontWeight: "600" }}>Angle {n}{required ? "" : "  (optional)"}</Text>
        <Text numberOfLines={1} style={{ color: picked ? hues.gold.hi : neutrals.muted2, fontSize: 12, marginTop: 3 }}>
          {picked ? (picked.fileName ?? "Video selected") : "No video chosen"}
        </Text>
      </View>
      {picked ? (
        <TouchableOpacity onPress={onClear}><Text style={{ color: neutrals.muted, fontSize: 13 }}>Remove</Text></TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={onPick} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9, borderWidth: 1, borderColor: neutrals.border }}>
          <Text style={{ color: neutrals.text, fontWeight: "600", fontSize: 13 }}>Choose</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
