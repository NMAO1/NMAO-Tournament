import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, metalStops, spectrum as _spectrum, status } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/env";

// Temporary release diagnostic (remove once login is confirmed on device).
const BUILD_TAG = "b10";

export default function Login({ onSignup }: { onSignup: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [probe, setProbe] = useState("probe…");

  // Raw fetch to Supabase with the apikey header — isolates whether RN's fetch
  // can reach Supabase with a key at all, independent of the supabase-js client.
  useEffect(() => {
    fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } })
      .then((r) => setProbe(`health:${r.status}`))
      .catch((e) => setProbe(`health:err ${String(e?.message ?? e).slice(0, 20)}`));
  }, []);

  async function signIn() {
    setBusy(true); setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setMsg(error.message); // success flips the app via onAuthStateChange
  }
  async function reset() {
    if (!email.trim()) { setMsg("Enter your email first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setMsg(error ? error.message : "Check your email for a link to set a password.");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: neutrals.bg, justifyContent: "center", padding: 26 }}>
      <View style={{ width: "100%", maxWidth: 640, alignSelf: "center" }}>
      <LinearGradient colors={["#FF2E3B", "#A32BF7", "#1F7BFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 4, width: 150, borderRadius: 99, alignSelf: "center", marginBottom: 18 }} />
      <Text style={{ color: neutrals.text, fontSize: 30, fontWeight: "700", textAlign: "center" }}>NMAO Compete</Text>
      <Text style={{ color: neutrals.muted, textAlign: "center", marginTop: 4, marginBottom: 26 }}>Sign in to enter the arena.</Text>

      <Text style={{ color: neutrals.muted, fontSize: 12, marginBottom: 6 }}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        placeholderTextColor={neutrals.muted2} placeholder="you@example.com"
        style={inputStyle} />
      <Text style={{ color: neutrals.muted, fontSize: 12, marginBottom: 6, marginTop: 14 }}>Password</Text>
      <TextInput value={pw} onChangeText={setPw} secureTextEntry autoComplete="password"
        placeholderTextColor={neutrals.muted2} placeholder="••••••••"
        style={inputStyle} />

      <TouchableOpacity onPress={signIn} disabled={busy} activeOpacity={0.85} style={{ marginTop: 22 }}>
        <LinearGradient colors={metalStops("gold")} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ borderRadius: 12, paddingVertical: 15, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#141210" /> : <Text style={{ color: "#141210", fontWeight: "800", fontSize: 16 }}>Sign In</Text>}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={reset} style={{ marginTop: 14, alignItems: "center" }}>
        <Text style={{ color: neutrals.muted, fontSize: 13 }}>Forgot your password? Email me a link</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSignup} style={{ marginTop: 16, alignItems: "center" }}>
        <Text style={{ color: neutrals.muted, fontSize: 13 }}>New to NMAO? <Text style={{ color: neutrals.text, fontWeight: "700" }}>Create an account</Text></Text>
      </TouchableOpacity>

      {msg ? <Text style={{ color: msg.startsWith("Check") ? status.success : status.danger, textAlign: "center", marginTop: 16 }}>{msg}</Text> : null}
      <Text style={{ color: neutrals.muted2, fontSize: 10, textAlign: "center", marginTop: 26 }}>
        {BUILD_TAG} · key {SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.slice(0, 6) : "MISSING"} ({SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.length : 0}) · {probe}
      </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  backgroundColor: "#0e0e11", borderColor: neutrals.border, borderWidth: 1, borderRadius: 11,
  paddingHorizontal: 14, paddingVertical: 13, color: neutrals.text, fontSize: 16,
} as const;
