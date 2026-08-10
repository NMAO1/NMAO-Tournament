import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { neutrals, hues, metalStops, status } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { uploadEntryVideo, PickedVideo } from "../lib/upload";
import { myCompetitors } from "../lib/competitors";
import * as WebBrowser from "expo-web-browser";

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
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState<{ id: string; competitor_id: string; event: string }[]>([]);

  async function loadPending(compIds: string[]) {
    if (!compIds.length) { setPending([]); return; }
    const { data: en } = await supabase.from("entries")
      .select("id, competitor_id, event, payment_status").eq("payment_status", "unpaid").in("competitor_id", compIds);
    setPending(((en ?? []) as { id: string; competitor_id: string; event: string }[]).map((e) => ({ id: e.id, competitor_id: e.competitor_id, event: e.event })));
  }

  useEffect(() => {
    (async () => {
      const rows = await myCompetitors();
      setComps(rows);
      if (rows.length === 1) setCompetitorId(rows[0].id);
      loadPending(rows.map((r) => r.id));
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

  // Poll the entry until the Stripe webhook flips it to 'paid' (source of truth).
  async function waitForPaid(entryId: string): Promise<boolean> {
    for (let i = 0; i < 8; i++) {
      const { data } = await supabase.from("entries").select("payment_status").eq("id", entryId).maybeSingle();
      if ((data as any)?.payment_status === "paid") return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  // Register + pay in one motion (payment activates the entry). Payment happens
  // in the device BROWSER (Stripe Checkout) — deliberately OFF Apple's in-app
  // purchase rails (no 30% cut). Gated to the competitor/guardian by
  // create-entry-checkout — schools can't pay here.
  async function payAndRegister(compId?: string, ev?: string) {
    const cid = compId ?? competitorId; const evt = ev ?? event;
    if (!cid || !evt) return;
    setPhase("working"); setStep("Registering…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-entry-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ competitor_id: cid, event: evt }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Could not start payment.");
      setStep("Opening secure checkout…");
      await WebBrowser.openBrowserAsync(j.url); // resolves when the user closes the browser
      setStep("Confirming payment…");
      const ok = await waitForPaid(j.entry_id);
      if (!ok) {
        Alert.alert("Payment pending", "We couldn't confirm your payment yet. If you completed it, your entry will unlock in a moment — pull to refresh.");
        setPhase("idle"); setStep(""); return;
      }
      setCompetitorId(cid); setEvent(evt); setPaid(true); setPhase("idle"); setStep("");
      setPending((p) => p.filter((x) => !(x.competitor_id === cid && x.event === evt)));
    } catch (e: any) {
      Alert.alert("Registration", e?.message ?? "Please try again."); setPhase("idle"); setStep("");
    }
  }

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

  function reset() { setDone(null); setEvent(null); setVid1(null); setVid2(null); setPaid(false); }

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

      {pending.length > 0 && !paid && (
        <Section label="Awaiting payment">
          {pending.map((p) => {
            const c = comps.find((x) => x.id === p.competitor_id);
            return (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(230,185,63,0.08)", borderWidth: 1, borderColor: hues.gold.shadow, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: neutrals.text, fontWeight: "600" }}>{EVENTS.find((e) => e.code === p.event)?.name ?? p.event}</Text>
                  <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 2 }}>{c ? `${c.first_name} ${c.last_name}` : "Registered — finish to compete"}</Text>
                </View>
                <TouchableOpacity onPress={() => payAndRegister(p.competitor_id, p.event)} activeOpacity={0.85}>
                  <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9 }}>
                    <Text style={{ color: "#141210", fontWeight: "800", fontSize: 13 }}>Complete</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            );
          })}
        </Section>
      )}

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
                <Chip key={e.code} active={event === e.code} onPress={() => { setEvent(e.code); setPaid(false); }} label={e.name} />
              ))}
            </View>
          </Section>

          {event && !paid && (
            <>
              <TouchableOpacity onPress={() => payAndRegister()} disabled={phase === "working"} activeOpacity={0.85} style={{ marginTop: 8 }}>
                <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                  style={{ borderRadius: 13, paddingVertical: 16, alignItems: "center", opacity: phase === "working" ? 0.7 : 1 }}>
                  {phase === "working"
                    ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color="#141210" /><Text style={{ color: "#141210", fontWeight: "800" }}>{step || "Opening payment…"}</Text></View>
                    : <Text style={{ color: "#141210", fontWeight: "800", fontSize: 16 }}>Register</Text>}
                </LinearGradient>
              </TouchableOpacity>
              <Text style={{ color: neutrals.muted2, fontSize: 12, marginTop: 10, textAlign: "center" }}>Secure your spot — you'll upload your video next.</Text>
            </>
          )}

          {paid && (
            <>
              <View style={{ backgroundColor: "rgba(90,154,106,0.12)", borderWidth: 1, borderColor: "#3f7a52", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <Text style={{ color: "#7ED0A0", fontWeight: "700", fontSize: 13 }}>✓ Entry fee paid — you're registered. Upload your video to compete.</Text>
              </View>
              <Section label="Videos">
                <Text style={{ color: neutrals.muted2, fontSize: 12, marginBottom: 10 }}>
                  Add up to two angles (front + side). Angle 1 is required. Exported at 1080p for crisp judging detail.
                </Text>
                <VideoSlot n={1} picked={vid1} onPick={() => pick(1)} onClear={() => setVid1(null)} required />
                <View style={{ height: 10 }} />
                <VideoSlot n={2} picked={vid2} onPick={() => pick(2)} onClear={() => setVid2(null)} />
              </Section>

              <TouchableOpacity onPress={submit} disabled={!ready} activeOpacity={0.85} style={{ marginTop: 8 }}>
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
