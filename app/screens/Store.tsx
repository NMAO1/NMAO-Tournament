import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { storeProducts, sponsorClick, type StoreProduct } from "../lib/store";

// The sponsor Store — a link-out marketplace grouped by brand. Tapping a product
// records a click and opens the sponsor's own page. (Full screen, like Journal.)
export default function Store({ onBack }: { onBack: () => void }) {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => storeProducts().then(setProducts);
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const open = (p: StoreProduct) => {
    sponsorClick("product_click", { productId: p.id });
    if (p.productUrl) Linking.openURL(p.productUrl).catch(() => { /* ignore */ });
  };

  // group products by sponsor, preserving store_products() order
  const groups: { sponsor: string; logo: string | null; items: StoreProduct[] }[] = [];
  for (const p of products ?? []) {
    let g = groups.find((x) => x.sponsor === p.sponsorName);
    if (!g) { g = { sponsor: p.sponsorName, logo: p.sponsorLogo, items: [] }; groups.push(g); }
    g.items.push(p);
  }

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12 }}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: neutrals.text, fontSize: 15 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: neutrals.text, fontSize: 18, fontWeight: "800", marginLeft: 14 }}>Store</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={neutrals.muted} />}>
        <Text style={{ color: neutrals.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
          Gear and offers from the brands that support NMAO. Tap a product to visit the sponsor.
        </Text>

        {products === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color={neutrals.muted} /></View>
        ) : groups.length === 0 ? (
          <Text style={{ color: neutrals.muted2, fontSize: 14, marginTop: 6 }}>No sponsor products yet — check back soon.</Text>
        ) : (
          groups.map((g) => (
            <View key={g.sponsor} style={{ marginBottom: 26 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                {g.logo ? <Image source={{ uri: g.logo }} style={{ width: 26, height: 26, borderRadius: 6 }} /> : null}
                <Text style={{ color: hues.gold.hi, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "800" }}>{g.sponsor}</Text>
              </View>
              {g.items.map((p) => (
                <TouchableOpacity key={p.id} activeOpacity={0.85} onPress={() => open(p)}
                  style={{ flexDirection: "row", gap: 12, backgroundColor: neutrals.surface, borderWidth: 1, borderColor: neutrals.border, borderRadius: 14, padding: 12, marginBottom: 10 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", backgroundColor: "#0d0a06", alignItems: "center", justifyContent: "center" }}>
                    {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: 64, height: 64 }} /> : <Text style={{ fontSize: 22 }}>🛍️</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: neutrals.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>{p.name}</Text>
                    {p.description ? <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 2, lineHeight: 16 }} numberOfLines={2}>{p.description}</Text> : null}
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                      {p.priceDisplay ? <Text style={{ color: hues.gold.hi, fontWeight: "800", fontSize: 14 }}>{p.priceDisplay}</Text> : <View />}
                      <Text style={{ color: neutrals.muted2, fontSize: 12, fontWeight: "600" }}>View ↗</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}

        {groups.length > 0 && (
          <Text style={{ color: neutrals.muted2, fontSize: 10, textAlign: "center", marginTop: 8 }}>Sponsored — products open on the sponsor&apos;s own site.</Text>
        )}
      </ScrollView>
    </View>
  );
}
