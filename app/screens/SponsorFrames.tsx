import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { availableSponsorFrames, equipSponsorFrame, type SponsorFrameOption } from "../lib/frames";

// Pick a sponsor's branded frame to wear on your duel videos. Equipping one rings
// your form in the sponsor's colors — seen by everyone who watches your duels.
export default function SponsorFrames({ competitorId, onBack }: { competitorId: string; onBack: () => void }) {
  const [frames, setFrames] = useState<SponsorFrameOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => availableSponsorFrames(competitorId).then(setFrames);
  useEffect(() => { load(); }, [competitorId]);

  const equip = async (id: string | null) => {
    setBusy(id ?? "none");
    await equipSponsorFrame(competitorId, id);
    await load();
    setBusy(null);
  };
  const anyEquipped = !!frames?.some((f) => f.equipped);

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: neutrals.text, fontSize: 15 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: neutrals.text, fontSize: 18, fontWeight: "800", marginLeft: 14 }}>Sponsor Frames</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
          Rep a brand that supports NMAO — their frame rings your duel video for everyone who watches.
        </Text>

        {/* None / unequip */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => equip(null)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: neutrals.surface, borderWidth: 1, borderColor: !anyEquipped ? hues.gold.base : neutrals.border, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 15 }}>No sponsor frame</Text>
          <Text style={{ color: !anyEquipped ? hues.gold.hi : neutrals.muted2, fontSize: 13, fontWeight: "700" }}>{busy === "none" ? "…" : !anyEquipped ? "✓ Current" : "Wear none"}</Text>
        </TouchableOpacity>

        {frames === null ? (
          <View style={{ paddingVertical: 30, alignItems: "center" }}><ActivityIndicator color={neutrals.muted} /></View>
        ) : frames.length === 0 ? (
          <Text style={{ color: neutrals.muted2, fontSize: 14 }}>No sponsor frames available yet — check back soon.</Text>
        ) : (
          frames.map((f) => <FrameCard key={f.id} f={f} busy={busy === f.id} onEquip={() => equip(f.id)} />)
        )}
      </ScrollView>
    </View>
  );
}

function FrameCard({ f, busy, onEquip }: { f: SponsorFrameOption; busy: boolean; onEquip: () => void }) {
  return (
    <View style={{ backgroundColor: neutrals.surface, borderWidth: 1, borderColor: f.equipped ? hues.gold.base : neutrals.border, borderRadius: 16, padding: 14, marginBottom: 14 }}>
      <View style={{ flexDirection: "row", gap: 14 }}>
        {/* mini preview of the branded frame */}
        <View style={{ width: 92, borderRadius: 12, padding: 6, paddingBottom: 18, backgroundColor: f.accentColor }}>
          <View style={{ height: 72, borderRadius: 7, backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {f.imageUrl ? <Image source={{ uri: f.imageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <Text style={{ fontSize: 26 }}>🥋</Text>}
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 3 }}>
            {f.logoUrl ? <Image source={{ uri: f.logoUrl }} style={{ width: 20, height: 20, borderRadius: 10 }} /> : null}
            <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{f.sponsorName}</Text>
          </View>
          <Text style={{ color: neutrals.muted, fontSize: 12 }} numberOfLines={1}>{f.label}</Text>
          {f.animation !== "none" ? <Text style={{ color: neutrals.muted2, fontSize: 10, marginTop: 2, textTransform: "capitalize" }}>✦ {f.animation} border</Text> : null}
          <TouchableOpacity onPress={onEquip} disabled={f.equipped || busy}
            style={{ marginTop: 10, alignSelf: "flex-start", borderRadius: 9, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: f.equipped ? "transparent" : hues.gold.base, borderWidth: f.equipped ? 1 : 0, borderColor: hues.gold.base }}>
            <Text style={{ color: f.equipped ? hues.gold.hi : "#141210", fontWeight: "800", fontSize: 13 }}>{busy ? "…" : f.equipped ? "✓ Equipped" : "Equip"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
