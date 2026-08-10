import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { neutrals, hues, metalStops } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { uploadInhouseVideo, PickedVideo } from "../lib/upload";

const EXPORT_PRESET = ImagePicker.VideoExportPreset.H264_1920x1080;
const MAX_MB = 500;

export type VideoTask = { entrant_id: string; competitor_id: string; tournament_name: string; event: string | null; division: string | null; prize?: string | null };

// Mirrors the championship submit flow: pick a 1080p clip, upload to the private
// bucket, record it on the in-house entry via submit-inhouse-video.
export default function InHouseUpload({ task, onDone, onClose }: { task: VideoTask; onDone: () => void; onClose: () => void }) {
  const [vid, setVid] = useState<PickedVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow video access to submit your entry."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], videoExportPreset: EXPORT_PRESET, videoMaxDuration: 150, quality: 1 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const info = await FileSystem.getInfoAsync(a.uri);
    const sizeMb = info.exists && info.size ? info.size / (1024 * 1024) : 0;
    if (sizeMb > MAX_MB) { Alert.alert("Video too large", `This clip is ${Math.round(sizeMb)} MB — over the ${MAX_MB} MB limit. Trim it shorter.`); return; }
    setVid({ uri: a.uri, mimeType: a.mimeType, fileName: a.fileName });
  }

  async function submit() {
    if (!vid) return;
    setBusy(true); setStep("Uploading…");
    try {
      const path = await uploadInhouseVideo(task.competitor_id, task.entrant_id, vid);
      setStep("Submitting…");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/submit-inhouse-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ entrant_id: task.entrant_id, video_path: path }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not submit your video.");
      onDone();
    } catch (e: any) {
      Alert.alert("Video not submitted", e?.message ?? "Please try again.");
    } finally { setBusy(false); setStep(""); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg, padding: 22, paddingTop: 64 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ color: neutrals.text, fontSize: 24, fontWeight: "700" }}>Submit your video</Text>
        <TouchableOpacity onPress={onClose} disabled={busy}><Text style={{ color: neutrals.muted, fontSize: 14 }}>Cancel</Text></TouchableOpacity>
      </View>
      <Text style={{ color: hues.gold.hi, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" }}>{task.tournament_name}</Text>
      <Text style={{ color: neutrals.muted, fontSize: 14, marginTop: 4, marginBottom: 26 }}>{[task.event, task.division].filter(Boolean).join(" · ") || "Entry"}</Text>

      <TouchableOpacity onPress={pick} disabled={busy} activeOpacity={0.85}
        style={{ borderWidth: 1, borderColor: vid ? hues.gold.base : neutrals.border, borderRadius: 16, borderStyle: vid ? "solid" : "dashed", padding: 28, alignItems: "center", backgroundColor: vid ? "rgba(230,185,63,0.06)" : "transparent" }}>
        <Text style={{ fontSize: 34 }}>{vid ? "🎬" : "＋"}</Text>
        <Text style={{ color: vid ? hues.gold.hi : neutrals.muted, fontWeight: "600", marginTop: 8 }}>{vid ? "Video selected — tap to replace" : "Choose your video"}</Text>
        <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 4 }}>Up to {MAX_MB} MB · exported at 1080p</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={submit} disabled={!vid || busy} activeOpacity={0.85} style={{ marginTop: 26, opacity: !vid || busy ? 0.5 : 1 }}>
        <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ borderRadius: 12, paddingVertical: 15, alignItems: "center" }}>
          {busy ? <ActivityIndicator color="#141210" /> : <Text style={{ color: "#141210", fontWeight: "800", fontSize: 16 }}>Submit video</Text>}
        </LinearGradient>
      </TouchableOpacity>
      {step ? <Text style={{ color: neutrals.muted, fontSize: 13, textAlign: "center", marginTop: 12 }}>{step}</Text> : null}
    </View>
  );
}
