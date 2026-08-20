import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { loadPricing, createEntitlementCheckout, myEntitlements, type Lane, type PricingTier } from "../lib/pricing";
import { SpectrumText } from "../components/SpectrumText";

const EVENTS = [
  { code: "trad_forms", name: "Traditional Forms" },
  { code: "open_forms", name: "Open Forms" },
  { code: "trad_weapons", name: "Traditional Weapons" },
  { code: "open_weapons", name: "Open Weapons" },
];
const LANES: { key: Lane; name: string; blurb: string; unit: string }[] = [
  { key: "alacarte", name: "Pay per round", blurb: "Pay for this round only.", unit: "/round" },
  { key: "monthly", name: "Monthly", blurb: "Auto-renews each tournament month. Cancel anytime.", unit: "/mo" },
  { key: "full", name: "Season pass", blurb: "One payment, all 9 tournaments — the best value.", unit: "season" },
];
const money = (c: number) => `$${(c / 100).toFixed(0)}`;

// The paid-entry flow: pick event count + which events + a payment lane, then
// pay via Stripe hosted Checkout in the browser (no in-app IAP). A webhook
// activates the entitlement.
export default function BuyEntry({ competitorId, onClose, onPaid }: { competitorId: string; onClose: () => void; onPaid: () => void }) {
  const [tiers, setTiers] = useState<PricingTier[] | null>(null);
  const [slots, setSlots] = useState<1 | 2>(1);
  const [events, setEvents] = useState<string[]>([]);
  const [lane, setLane] = useState<Lane>("full");
  const [paying, setPaying] = useState(false);

  useEffect(() => { loadPricing().then(setTiers); }, []);
  useEffect(() => { setEvents((cur) => cur.slice(0, slots)); }, [slots]);

  const priceFor = (l: Lane) => tiers?.find((t) => t.lane === l && t.event_slots === slots);

  function toggleEvent(code: string) {
    setEvents((cur) => cur.includes(code) ? cur.filter((c) => c !== code) : cur.length < slots ? [...cur, code] : [...cur.slice(1), code]);
  }

  async function pay() {
    setPaying(true);
    try {
      const res = await createEntitlementCheckout({ competitor_id: competitorId, lane, event_slots: slots, events });
      if (!res.ok || !res.url) { Alert.alert("Payment", res.error || "Could not start checkout."); setPaying(false); return; }
      // Open Stripe's hosted Checkout in the browser (keeps purchases off Apple's
      // in-app-purchase rails). Resolves when the user closes the browser.
      await WebBrowser.openBrowserAsync(res.url);
      // The webhook activates the entitlement — poll briefly for confirmation.
      let active = false;
      for (let i = 0; i < 6 && !active; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        const ents = await myEntitlements(competitorId);
        if (res.entitlement_id && ents.some((e) => e.id === res.entitlement_id && e.status === "active")) active = true;
      }
      setPaying(false);
      if (active) { Alert.alert("You're in!", "Your entry is confirmed."); onPaid(); }
      else { Alert.alert("Almost there", "If you completed payment, your entry will activate in a moment."); onClose(); }
    } catch (e: any) { setPaying(false); Alert.alert("Payment", e?.message || "Something went wrong."); }
  }

  if (!tiers) return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;

  const p = priceFor(lane);
  const canPay = events.length > 0 && !paying;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }}><Text style={{ color: neutrals.muted, fontSize: 24 }}>‹</Text></TouchableOpacity>
        <SpectrumText style={{ fontSize: 16, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Enter the Season</SpectrumText>
      </View>

      <Label t="How many events per round?" />
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
        {[1, 2].map((n) => (
          <TouchableOpacity key={n} onPress={() => setSlots(n as 1 | 2)} activeOpacity={0.85} style={{ flex: 1 }}>
            <View style={{ borderRadius: 14, paddingVertical: 16, alignItems: "center", backgroundColor: slots === n ? "rgba(255,255,255,0.05)" : "transparent", borderWidth: 1.5, borderColor: slots === n ? hues.gold.base : neutrals.border }}>
              <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "800" }}>{n}</Text>
              <Text style={{ color: neutrals.muted2, fontSize: 12 }}>event{n > 1 ? "s" : ""}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <Label t={`Which event${slots > 1 ? "s" : ""}? (pick ${slots})`} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {EVENTS.map((e) => {
          const on = events.includes(e.code);
          return (
            <TouchableOpacity key={e.code} onPress={() => toggleEvent(e.code)} activeOpacity={0.8} style={{ borderRadius: 999, paddingVertical: 9, paddingHorizontal: 15, borderWidth: 1, borderColor: on ? hues.sapphire.base : neutrals.border, backgroundColor: on ? "rgba(31,123,255,0.12)" : "transparent" }}>
              <Text style={{ color: on ? hues.sapphire.hi : neutrals.muted, fontSize: 13, fontWeight: on ? "700" : "500" }}>{e.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={{ color: neutrals.muted2, fontSize: 11, marginBottom: 22 }}>You can change which events you enter each round.</Text>

      <Label t="Choose your plan" />
      {LANES.map((l) => {
        const lp = priceFor(l.key);
        const on = lane === l.key;
        return (
          <TouchableOpacity key={l.key} onPress={() => setLane(l.key)} activeOpacity={0.85} style={{ marginBottom: 10 }}>
            <View style={{ borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: on ? hues.gold.base : neutrals.border, backgroundColor: on ? "rgba(230,185,63,0.06)" : "#141216", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800" }}>{l.name}{l.key === "full" ? "  ·  best value" : ""}</Text>
                <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>{l.blurb}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: on ? hues.gold.hi : neutrals.text, fontSize: 20, fontWeight: "800" }}>{lp ? money(lp.unit_amount_cents) : "—"}</Text>
                <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{l.unit}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity onPress={pay} disabled={!canPay} activeOpacity={0.9} style={{ marginTop: 18, opacity: canPay ? 1 : 0.5 }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14, paddingVertical: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
            {paying ? "Opening payment…" : `Pay ${p ? money(p.unit_amount_cents) : ""}${lane === "monthly" ? "/mo" : ""} · ${slots} event${slots > 1 ? "s" : ""}`}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
      <Text style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16 }}>
        {lane === "monthly" ? "Renews on the 1st of each tournament month. Cancel anytime." : lane === "full" ? "One payment covers all remaining tournaments this season." : "Covers this round only."}
      </Text>
    </ScrollView>
  );
}

function Label({ t }: { t: string }) {
  return <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800", marginBottom: 10 }}>{t}</Text>;
}
