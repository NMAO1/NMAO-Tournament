import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { myPrizes, claimPrize, type MyPrize } from "../lib/prizes";

const STATUS_LABEL: Record<string, string> = {
  unclaimed: "Claim it", claimed: "Claimed", shipped: "Shipped", fulfilled: "Delivered", forfeited: "Expired",
};

// Prizes a champion has won. Claiming routes fulfillment to the dojo — a prize is
// never shipped to a competitor's home address.
export default function MyPrizes({ competitorId, onBack }: { competitorId: string; onBack: () => void }) {
  const [prizes, setPrizes] = useState<MyPrize[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => myPrizes(competitorId).then(setPrizes);
  useEffect(() => { load(); }, [competitorId]);

  const claim = async (id: string) => {
    setBusy(id); setErr(null);
    const r = await claimPrize(id);
    if (!r.ok) setErr(r.error ?? "Could not claim.");
    await load();
    setBusy(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: neutrals.text, fontSize: 15 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: neutrals.text, fontSize: 18, fontWeight: "800", marginLeft: 14 }}>My Prizes</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {prizes === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={neutrals.muted} /></View>
        ) : prizes.length === 0 ? (
          <Text style={{ color: neutrals.muted2, fontSize: 14, marginTop: 6 }}>No prizes yet — keep competing. Prizes you win appear here to claim.</Text>
        ) : (
          <>
            <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
              Prizes you&apos;ve won. Claimed prizes are sent to your dojo for you to pick up.
            </Text>
            {err ? <Text style={{ color: hues.ruby.hi, fontSize: 13, marginBottom: 10 }}>{err}</Text> : null}
            {prizes.map((p) => {
              const claimable = p.claimStatus === "unclaimed";
              return (
                <View key={p.awardId} style={{ flexDirection: "row", gap: 12, backgroundColor: neutrals.surface, borderWidth: 1, borderColor: claimable ? hues.gold.base : neutrals.border, borderRadius: 16, padding: 13, marginBottom: 12 }}>
                  <View style={{ width: 70, height: 70, borderRadius: 10, overflow: "hidden", backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center" }}>
                    {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: 70, height: 70 }} /> : <Text style={{ fontSize: 30 }}>🏆</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>{p.title}</Text>
                    {p.sponsorName ? <Text style={{ color: neutrals.muted2, fontSize: 11, marginTop: 1 }}>from {p.sponsorName}</Text> : null}
                    {p.description ? <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{p.description}</Text> : null}
                    <TouchableOpacity onPress={() => claimable && claim(p.awardId)} disabled={!claimable || busy === p.awardId}
                      style={{ marginTop: 9, alignSelf: "flex-start", borderRadius: 9, paddingHorizontal: 15, paddingVertical: 7, backgroundColor: claimable ? hues.gold.base : "transparent", borderWidth: claimable ? 0 : 1, borderColor: neutrals.border }}>
                      <Text style={{ color: claimable ? "#141210" : neutrals.muted, fontWeight: "800", fontSize: 12.5 }}>
                        {busy === p.awardId ? "…" : (STATUS_LABEL[p.claimStatus] ?? p.claimStatus)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <Text style={{ color: neutrals.muted2, fontSize: 10, textAlign: "center", marginTop: 8 }}>Prizes ship to your dojo — never to a home address.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
