import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, spectrumStops, status } from "@nmao/design-tokens";
import { supabase } from "../lib/supabase";

// Guardian-first account creation. A parent/guardian makes the account; they add
// their competitor(s) and consent in the onboarding wizard right after.
export default function Signup({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function signUp() {
    if (!email.trim()) return setMsg("Enter your email.");
    if (pw.length < 8) return setMsg("Use a password of at least 8 characters.");
    if (pw !== pw2) return setMsg("Passwords don't match.");
    setBusy(true); setMsg("");
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    // If confirmation is required, no session is returned yet.
    if (!data.session) setMsg("Check your email to confirm your account, then sign in.");
    // With confirmation off, onAuthStateChange flips the app into onboarding.
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: neutrals.bg, justifyContent: "center", padding: 26 }}>
      <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ height: 4, width: 150, borderRadius: 99, alignSelf: "center", marginBottom: 18 }} />
      <Text style={{ color: neutrals.text, fontSize: 28, fontWeight: "800", textAlign: "center" }}>Create your account</Text>
      <Text style={{ color: neutrals.muted, textAlign: "center", marginTop: 4, marginBottom: 24 }}>
        Parents & guardians start here — you'll add your competitor next.
      </Text>

      <Text style={labelStyle}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        placeholderTextColor={neutrals.muted2} placeholder="you@example.com" style={inputStyle} />
      <Text style={[labelStyle, { marginTop: 14 }]}>Password</Text>
      <TextInput value={pw} onChangeText={setPw} secureTextEntry placeholderTextColor={neutrals.muted2} placeholder="At least 8 characters" style={inputStyle} />
      <Text style={[labelStyle, { marginTop: 14 }]}>Confirm password</Text>
      <TextInput value={pw2} onChangeText={setPw2} secureTextEntry placeholderTextColor={neutrals.muted2} placeholder="••••••••" style={inputStyle} />

      <TouchableOpacity onPress={signUp} disabled={busy} activeOpacity={0.85} style={{ marginTop: 22, borderRadius: 12, overflow: "hidden" }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 15, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Create account</Text>}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={onBack} style={{ marginTop: 16, alignItems: "center" }}>
        <Text style={{ color: neutrals.muted, fontSize: 13 }}>Already have an account? <Text style={{ color: neutrals.text, fontWeight: "700" }}>Sign in</Text></Text>
      </TouchableOpacity>

      {msg ? <Text style={{ color: msg.startsWith("Check") ? status.success : status.danger, textAlign: "center", marginTop: 16 }}>{msg}</Text> : null}
    </KeyboardAvoidingView>
  );
}

const labelStyle = { color: neutrals.muted, fontSize: 12, marginBottom: 6 } as const;
const inputStyle = {
  backgroundColor: "#0e0e11", borderColor: neutrals.border, borderWidth: 1, borderRadius: 11,
  paddingHorizontal: 14, paddingVertical: 13, color: neutrals.text, fontSize: 16,
} as const;
