import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, metalStops, status as statusColors } from "@nmao/design-tokens";
import { joinSchoolByCode } from "../lib/onboard";

// Shown on the Compete tab when the active competitor isn't confirmed onto a
// school roster yet. 'none' → enter a join code; 'pending' → awaiting the
// instructor's approval. Only a confirmed (school_id set) competitor may enter.
export default function SchoolGate({ competitorId, status, schoolName, onJoined }: {
  competitorId: string; status: "none" | "pending"; schoolName?: string | null; onJoined: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function join() {
    if (!code.trim()) { setMsg("Enter your school's join code."); return; }
    setBusy(true); setMsg("");
    const r = await joinSchoolByCode(code.trim(), competitorId);
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Couldn't join — double-check the code with your instructor."); return; }
    onJoined();
  }

  if (status === "pending") {
    return (
      <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 30 }}>
        <Text style={{ fontSize: 46 }}>⏳</Text>
        <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "700", marginTop: 16, textAlign: "center" }}>Waiting for approval</Text>
        <Text style={{ color: neutrals.muted, fontSize: 15, marginTop: 10, textAlign: "center", lineHeight: 21, maxWidth: 340 }}>
          You&apos;ve asked to join {schoolName ? <Text style={{ color: neutrals.text, fontWeight: "700" }}>{schoolName}</Text> : "your school"}. Your instructor needs to approve you before you can enter tournaments — pull down to refresh once they do.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center", padding: 30 }}>
      <Text style={{ fontSize: 46 }}>🥋</Text>
      <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "700", marginTop: 16, textAlign: "center" }}>Join your school</Text>
      <Text style={{ color: neutrals.muted, fontSize: 14, marginTop: 10, textAlign: "center", lineHeight: 20, maxWidth: 340 }}>
        Enter your dojo&apos;s join code to compete. Ask your instructor for it — they&apos;ll approve you before your first tournament.
      </Text>
      <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false}
        placeholder="e.g. TAOSD-B4H" placeholderTextColor={neutrals.muted2}
        style={{ backgroundColor: "#0e0e11", borderColor: neutrals.border, borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13, color: neutrals.text, fontSize: 18, fontWeight: "700", letterSpacing: 2, textAlign: "center", marginTop: 22, width: "100%", maxWidth: 320 }} />
      {msg ? <Text style={{ color: statusColors.danger, marginTop: 12, textAlign: "center" }}>{msg}</Text> : null}
      <TouchableOpacity onPress={join} disabled={busy} activeOpacity={0.85} style={{ marginTop: 18, width: "100%", maxWidth: 320 }}>
        <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#141210" /> : <Text style={{ color: "#141210", fontWeight: "800", fontSize: 16 }}>Join school</Text>}
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => Linking.openURL("https://directory.nmao.us")} style={{ marginTop: 18 }}>
        <Text style={{ color: neutrals.muted, fontSize: 13, textAlign: "center" }}>Don&apos;t know your code? <Text style={{ color: neutrals.text, fontWeight: "700" }}>Find your school →</Text></Text>
      </TouchableOpacity>
    </View>
  );
}
