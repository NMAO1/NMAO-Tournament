import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { listJournal, addJournal, promptFor, type JournalEntry } from "../lib/journal";

// The private growth journal — prompts + freeform, own-login only.
export default function Journal({ competitorId, initialPrompt, onClose }: { competitorId: string; initialPrompt?: string | null; onClose: () => void }) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [prompt, setPrompt] = useState<string | null>(initialPrompt ?? null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { listJournal(competitorId).then(setEntries); }, [competitorId]);

  async function save() {
    if (!body.trim()) return;
    setSaving(true);
    const r = await addJournal(competitorId, body, prompt);
    setSaving(false);
    if (!r.ok) { Alert.alert("Journal", r.error ?? "Couldn’t save."); return; }
    setBody(""); setPrompt(null);
    setEntries(await listJournal(competitorId));
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 54, paddingHorizontal: 18, paddingBottom: 6 }}>
        <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800", letterSpacing: 2, textTransform: "uppercase" }}>Journal</Text>
        <TouchableOpacity onPress={onClose}><Text style={{ color: neutrals.muted }}>Done</Text></TouchableOpacity>
      </View>
      <Text style={{ color: neutrals.muted2, fontSize: 11, paddingHorizontal: 18, marginBottom: 10 }}>🔒 Private to you.</Text>

      <View style={{ marginHorizontal: 18, borderWidth: 1, borderColor: neutrals.border, borderRadius: 14, backgroundColor: neutrals.surface, padding: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <Text style={{ color: hues.gold.hi, fontSize: 12, fontStyle: "italic", flex: 1, paddingRight: 8 }}>{prompt ?? "Freeform — write what’s on your mind."}</Text>
          <TouchableOpacity onPress={() => setPrompt(promptFor("free"))}><Text style={{ color: neutrals.muted2, fontSize: 11 }}>{prompt ? "↻" : "+ prompt"}</Text></TouchableOpacity>
        </View>
        <TextInput value={body} onChangeText={setBody} placeholder="Write here…" placeholderTextColor={neutrals.muted2} multiline
          style={{ color: neutrals.text, fontSize: 14, minHeight: 72, textAlignVertical: "top" }} />
        <TouchableOpacity onPress={save} disabled={saving || !body.trim()} activeOpacity={0.85} style={{ marginTop: 8, borderRadius: 10, overflow: "hidden", opacity: body.trim() ? 1 : 0.5 }}>
          <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ paddingVertical: 11, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800" }}>{saving ? "Saving…" : "Save reflection"}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 16 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 30 }}>
        {entries == null ? <ActivityIndicator color={neutrals.muted} style={{ marginTop: 20 }} /> : entries.length === 0 ? (
          <Text style={{ color: neutrals.muted2, textAlign: "center", marginTop: 20 }}>No reflections yet. Your growth log starts here.</Text>
        ) : entries.map((e) => (
          <View key={e.id} style={{ borderLeftWidth: 2, borderLeftColor: hues.gold.shadow, paddingLeft: 12, marginBottom: 16 }}>
            <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{new Date(e.createdAt).toLocaleDateString()}</Text>
            {e.prompt ? <Text style={{ color: hues.gold.hi, fontSize: 12, fontStyle: "italic", marginTop: 2 }}>{e.prompt}</Text> : null}
            <Text style={{ color: neutrals.text, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{e.body}</Text>
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
