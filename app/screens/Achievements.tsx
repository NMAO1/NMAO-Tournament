import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { neutrals, hues, rarityBase, type MedalType } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { Medal } from "../components/Medal";
import { Medallion, type Tier } from "../components/Medallion";
import { myCompetitors } from "../lib/competitors";
import { loadVault, equipFrame, markBadgesSeen, type Vault, type VaultBadge } from "../lib/vault";

const asMedal = (t: string): MedalType => (t === "gold" || t === "silver" || t === "bronze" || t === "participation" ? t : "participation");
const asTier = (t: string): Tier => (t === "gold" || t === "silver" || t === "bronze" ? t : "part");
// Season palette — S1 Sapphire (drives participation color + eyes on the twin).
const SEASON = { hi: "#66A9FF", b: "#1F7BFF", sh: "#0B3FD6" };

// The badge vault + medal case. Earned badges glow by rarity; tap one to wear its
// frame in the Arena. Locked badges are greyed goals.
export default function Achievements() {
  const [me, setMe] = useState<string | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);

  useEffect(() => {
    (async () => {
      const id = (await myCompetitors())[0]?.id ?? null;
      setMe(id);
      if (id) { setVault(await loadVault(id)); markBadgesSeen(id); }
    })();
  }, []);

  async function equip(b: VaultBadge) {
    if (!me || !b.earned) return;
    const next = vault?.equipped === b.code ? null : b.code;
    await equipFrame(me, next);
    setVault((v) => (v ? { ...v, equipped: next } : v));
  }

  if (!vault) {
    return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;
  }

  const earned = vault.badges.filter((b) => b.earned).length;
  // Map the season's earned medals onto the 8 medallion rounds (R1–R8); rest are ghost slots.
  const medTiers: (Tier | null)[] = Array.from({ length: 8 }, (_, i) => (vault.medals[i] ? asTier(vault.medals[i].tier) : null));
  const filled = medTiers.filter(Boolean).length;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 34 }}>
      <Label t="Your Season Medallion" />
      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <Medallion tiers={medTiers} season={SEASON} size={280} />
        <Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 0.3, marginTop: 4 }}>{filled} / 8 rounds · Season 1 · Sapphire</Text>
      </View>

      <Text style={{ color: neutrals.muted, marginBottom: 4, lineHeight: 20 }}>{earned} of {vault.badges.length} badges earned. Tap an earned badge to wear its frame.</Text>

      {vault.medals.length ? (
        <>
          <Label t="Medal case" />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {vault.medals.map((m, i) => (
              <View key={i} style={{ alignItems: "center", width: "25%", marginBottom: 12 }}>
                <Medal type={asMedal(m.tier)} place={m.place} size={50} />
                <Text style={{ color: neutrals.muted2, fontSize: 8, marginTop: 6, textAlign: "center" }} numberOfLines={1}>{m.event ?? m.tier}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Label t="Badge vault" />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {vault.badges.map((b) => {
          const equipped = vault.equipped === b.code;
          return (
            <TouchableOpacity key={b.code} onPress={() => equip(b)} activeOpacity={b.earned ? 0.7 : 1} style={{ width: "25%", alignItems: "center", marginBottom: 14, opacity: b.earned ? 1 : 0.4 }}>
              <View style={{ padding: 7, borderRadius: 16, backgroundColor: equipped ? "rgba(230,185,63,0.08)" : "#141216", borderWidth: 1, borderColor: equipped ? hues.gold.base : b.earned ? rarityBase(b.rarity) + "66" : neutrals.border }}>
                <Frame rarity={b.rarity} size="mini" radius={30} glow={b.earned}>
                  <View style={{ width: 50, height: 50, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: b.earned ? "#EFC24E" : neutrals.muted2, fontSize: 18 }}>◆</Text>
                  </View>
                </Frame>
              </View>
              <Text style={{ color: equipped ? hues.gold.hi : neutrals.muted2, fontSize: 8, marginTop: 6, textAlign: "center", fontWeight: equipped ? "800" : "400" }} numberOfLines={2}>
                {equipped ? "★ " : ""}{b.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function Label({ t }: { t: string }) {
  return <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800", marginTop: 16, marginBottom: 10 }}>{t}</Text>;
}
