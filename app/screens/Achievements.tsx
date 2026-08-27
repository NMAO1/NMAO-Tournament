import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { neutrals, hues, rarityBase, type MedalType } from "@nmao/design-tokens";
import { Frame } from "../components/Frame";
import { BadgeFrame } from "../components/BadgeFrame";
import { SpectrumText } from "../components/SpectrumText";
import { Medal } from "../components/Medal";
import { Medallion, type Tier } from "../components/Medallion";
import { useActiveCompetitor } from "../lib/activeCompetitor";
import { loadVault, equipFrame, emblemUrl, type Vault, type VaultBadge } from "../lib/vault";
import { useSeasonLabel } from "../lib/season";

const RARITY_LABEL: Record<string, string> = { legendary: "Legendary", epic: "Epic", rare: "Rare", common: "Common" };

const asMedal = (t: string): MedalType => (t === "gold" || t === "silver" || t === "bronze" || t === "participation" ? t : "participation");
const asTier = (t: string): Tier => (t === "gold" || t === "silver" || t === "bronze" ? t : "part");
// Season palette — S1 Sapphire (drives participation color + eyes on the twin).
const SEASON = { hi: "#66A9FF", b: "#1F7BFF", sh: "#0B3FD6" };

// The badge vault + medal case. Earned badges glow by rarity; tap one to wear its
// frame in the Arena. Locked badges are greyed goals.
export default function Achievements() {
  const season = useSeasonLabel();
  const [me, setMe] = useState<string | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [selBadge, setSelBadge] = useState<VaultBadge | null>(null);

  const { activeId } = useActiveCompetitor();
  useEffect(() => {
    setMe(activeId);
    if (activeId) loadVault(activeId).then(setVault); // reveal-only: the ceremony marks badges seen, not opening Honors
  }, [activeId]);

  // open a badge → a light tick of feedback (reward haptics)
  function openBadge(b: VaultBadge) {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch { /* optional */ }
    setSelBadge(b);
  }

  async function equip(b: VaultBadge) {
    if (!me || !b.earned) return;
    const next = vault?.equipped === b.code ? null : b.code;
    // equipping = a satisfying success thunk; removing = a lighter tick
    try {
      if (next) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { /* optional */ }
    await equipFrame(me, next);
    setVault((v) => (v ? { ...v, equipped: next } : v));
  }

  if (!vault) {
    return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;
  }

  // Every badge, deduped by code (keep the highest EARNED tier, else the base).
  // A badge reads "unlocked" only once REVEALED (earned && seen) — an earned-but-
  // unseen badge still shows as a locked silhouette so the ceremony stays its first
  // reveal. Locked badges render as greyed goals to chase (the whole vault, always).
  const byCode = vault.badges.reduce<Record<string, VaultBadge>>((acc, b) => {
    const cur = acc[b.code];
    const better = !cur
      || (b.earned && !cur.earned)
      || (b.earned === cur.earned && Number(b.tier ?? 0) > Number(cur.tier ?? 0));
    if (better) acc[b.code] = b;
    return acc;
  }, {});
  const isUnlocked = (b: VaultBadge) => b.earned && b.seen;
  const allBadges = Object.values(byCode).sort((a, b) => Number(isUnlocked(b)) - Number(isUnlocked(a)));
  const earned = allBadges.filter(isUnlocked).length;
  const total = allBadges.length;
  // Distinct badges earned but not yet revealed (across tiers) — the teaser count.
  const pendingReveal = new Set(vault.badges.filter((b) => b.earned && !b.seen).map((b) => b.code)).size;
  // Map the season's earned medals onto the 8 medallion rounds (R1–R8); rest are ghost slots.
  const medTiers: (Tier | null)[] = Array.from({ length: 8 }, (_, i) => (vault.medals[i] ? asTier(vault.medals[i].tier) : null));
  const filled = medTiers.filter(Boolean).length;
  const equipped = selBadge ? vault.equipped === selBadge.code : false;
  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingBottom: 34 }}>
      <Label t="Your Season Medallion" />
      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <Medallion tiers={medTiers} season={SEASON} size={280} />
        <Text style={{ color: neutrals.muted2, fontSize: 11, letterSpacing: 0.3, marginTop: 4 }}>{filled} / 8 rounds{season ? ` · ${season}` : ""}</Text>
      </View>

      <Text style={{ color: neutrals.muted, marginBottom: 4, lineHeight: 20 }}>
        <Text style={{ color: hues.gold.hi, fontWeight: "800" }}>{earned} of {total}</Text> badges earned{earned > 0 ? " — tap one to wear its frame." : " — compete to unlock them."}
      </Text>

      {pendingReveal > 0 ? (
        <View style={{ marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: "rgba(230,185,63,0.08)", borderWidth: 1, borderColor: hues.gold.shadow, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 22 }}>🎁</Text>
          <Text style={{ color: hues.gold.hi, fontSize: 13.5, fontWeight: "700", flex: 1 }}>{pendingReveal} new honor{pendingReveal === 1 ? "" : "s"} awaiting your next reveal — unveiled at the ceremony.</Text>
        </View>
      ) : null}

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

      {total > 0 ? (
        <>
          <Label t="Badge vault" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
            {allBadges.map((b) => {
          const u = isUnlocked(b);
          const equipped = vault.equipped === b.code;
          return (
            <TouchableOpacity key={b.code} onPress={() => openBadge(b)} activeOpacity={0.7} style={{ width: "25%", alignItems: "center", marginBottom: 14, opacity: u ? 1 : 0.5 }}>
              <View style={{ padding: 7, borderRadius: 16, backgroundColor: equipped ? "rgba(230,185,63,0.08)" : "#141216", borderWidth: 1, borderColor: equipped ? hues.gold.base : u ? rarityBase(b.rarity) + "66" : neutrals.border }}>
                <Frame rarity={b.rarity} size="mini" radius={30} glow={u}>
                  <View style={{ width: 50, height: 50, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
                    {emblemUrl(b.emblemKey) ? (
                      <Image source={{ uri: emblemUrl(b.emblemKey)! }} style={{ width: 50, height: 50 }} resizeMode="contain" tintColor={u ? undefined : "#4a4750"} />
                    ) : (
                      <Text style={{ color: u ? "#EFC24E" : neutrals.muted2, fontSize: 18 }}>◆</Text>
                    )}
                  </View>
                </Frame>
                {!u ? (
                  <View pointerEvents="none" style={{ position: "absolute", right: 4, bottom: 4, width: 17, height: 17, borderRadius: 9, backgroundColor: "rgba(8,6,4,0.82)", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 9 }}>🔒</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ color: equipped ? hues.gold.hi : neutrals.muted2, fontSize: 8, marginTop: 6, textAlign: "center", fontWeight: equipped ? "800" : "400" }} numberOfLines={2}>
                {equipped ? "★ " : ""}{b.name}
              </Text>
            </TouchableOpacity>
          );
        })}
          </View>
        </>
      ) : null}
    </ScrollView>

    <Modal visible={!!selBadge} transparent animationType="slide" onRequestClose={() => setSelBadge(null)}>
      <TouchableOpacity activeOpacity={1} onPress={() => setSelBadge(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" }}>
        {selBadge ? (
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: "#161618", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: "#2a2a2e", padding: 22, paddingBottom: 34, alignItems: "center" }}>
            <View style={{ width: 40, height: 4, borderRadius: 3, backgroundColor: "#3a3a3e", marginBottom: 16 }} />
            <BadgeFrame rarity={selBadge.rarity} w={112} h={112} radius={40}>
              <View style={{ flex: 1, backgroundColor: "#100d07", alignItems: "center", justifyContent: "center" }}>
                {emblemUrl(selBadge.emblemKey) ? (
                  <Image source={{ uri: emblemUrl(selBadge.emblemKey)! }} style={{ width: 84, height: 84 }} resizeMode="contain" tintColor={isUnlocked(selBadge) ? undefined : "#4a4750"} />
                ) : (
                  <Text style={{ color: "#EFC24E", fontSize: 32 }}>◆</Text>
                )}
              </View>
            </BadgeFrame>
            <Text style={{ color: neutrals.text, fontSize: 20, fontWeight: "800", marginTop: 14 }}>{selBadge.name}</Text>
            <Text style={{ color: rarityBase(selBadge.rarity), fontSize: 11, letterSpacing: 2, fontWeight: "800", textTransform: "uppercase", marginTop: 3 }}>
              {RARITY_LABEL[selBadge.rarity] ?? selBadge.rarity}{selBadge.tiered && selBadge.tier ? ` · Tier ${selBadge.tier}` : ""}
            </Text>
            {selBadge.description ? (
              <View style={{ marginTop: 18, alignItems: "center" }}>
                <Text style={{ color: hues.gold.hi, fontSize: 10, letterSpacing: 2, fontWeight: "800" }}>HOW TO EARN</Text>
                <Text style={{ color: neutrals.muted, fontSize: 14, textAlign: "center", marginTop: 6, lineHeight: 20 }}>{selBadge.description}</Text>
              </View>
            ) : null}
            {isUnlocked(selBadge) ? (
              <>
                <Text style={{ color: "#5DCAA5", fontSize: 12, fontWeight: "700", marginTop: 14 }}>✓ Earned</Text>
                <TouchableOpacity onPress={() => equip(selBadge)} activeOpacity={0.85} style={{ marginTop: 16, alignSelf: "stretch" }}>
                  <View style={{ borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: equipped ? "rgba(230,185,63,0.12)" : hues.gold.base, borderWidth: 1, borderColor: hues.gold.base }}>
                    <Text style={{ color: equipped ? hues.gold.hi : "#141210", fontWeight: "800", fontSize: 14 }}>{equipped ? "★ Equipped — tap to remove" : "Equip this frame"}</Text>
                  </View>
                </TouchableOpacity>
              </>
            ) : (
              <View style={{ marginTop: 16, alignSelf: "stretch", borderRadius: 12, paddingVertical: 13, alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: neutrals.border }}>
                <Text style={{ color: neutrals.muted, fontWeight: "800", fontSize: 13 }}>🔒 Not yet earned</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setSelBadge(null)} style={{ marginTop: 12 }}><Text style={{ color: neutrals.muted2, fontSize: 13 }}>Close</Text></TouchableOpacity>
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
    </Modal>
    </>
  );
}

function Label({ t }: { t: string }) {
  return (
    <View style={{ alignSelf: "flex-start", marginTop: 18, marginBottom: 12, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: neutrals.border }}>
      <SpectrumText style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800" }}>{t}</SpectrumText>
    </View>
  );
}
