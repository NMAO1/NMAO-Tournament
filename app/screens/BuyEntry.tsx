import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { loadPricing, createEntitlementCheckout, myEntitlements, creditSummary, SEASON_CREDITS, type Lane, type PricingTier } from "../lib/pricing";
import { SpectrumText } from "../components/SpectrumText";

const money = (c: number) => `$${(c / 100).toFixed(0)}`;
type Kind = "full" | "monthly" | "alacarte";

// Entry credits. Three simple ways to buy in: a season pass (a bucket of credits),
// a monthly subscription (a credit a month), or a single entry. Each event you
// enter spends 1 credit. Payment is Stripe hosted Checkout in the browser (no IAP).
export default function BuyEntry({ competitorId, onClose, onPaid }: { competitorId: string; onClose: () => void; onPaid: () => void }) {
  const [tiers, setTiers] = useState<PricingTier[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sel, setSel] = useState<Kind>("full");
  const [paying, setPaying] = useState(false);

  const refreshBalance = () => creditSummary(competitorId).then((s) => setBalance(s.credits_remaining));
  useEffect(() => { loadPricing().then(setTiers); refreshBalance(); }, []);

  const priceOf = (l: Lane) => tiers?.find((t) => t.lane === l && t.event_slots === 1)?.unit_amount_cents;
  const fullPrice = priceOf("full");
  const monthlyPrice = priceOf("monthly");
  const singlePrice = priceOf("alacarte");

  async function pay() {
    setPaying(true);
    try {
      const res = await createEntitlementCheckout({ competitor_id: competitorId, lane: sel as Lane, event_slots: 1 });
      if (!res.ok || !res.url) { Alert.alert("Payment", res.error || "Could not start checkout."); setPaying(false); return; }
      await WebBrowser.openBrowserAsync(res.url); // Stripe hosted Checkout (off Apple's IAP rails)
      // The webhook activates the entitlement — poll briefly for confirmation.
      let active = false;
      for (let i = 0; i < 6 && !active; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        const ents = await myEntitlements(competitorId);
        if (res.entitlement_id && ents.some((e) => e.id === res.entitlement_id && e.status === "active")) active = true;
      }
      await refreshBalance();
      setPaying(false);
      if (active) {
        const added = sel === "full" ? SEASON_CREDITS : 1;
        Alert.alert("You're in!", `${added} entry credit${added === 1 ? "" : "s"} added. Enter your events from the Compete tab — each event uses 1 credit.`);
        onPaid();
      } else {
        Alert.alert("Almost there", "If you completed payment, your credits will appear in a moment.");
      }
    } catch (e: any) { setPaying(false); Alert.alert("Payment", e?.message || "Something went wrong."); }
  }

  if (!tiers || balance === null) {
    return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;
  }

  const payAmount = sel === "full" ? fullPrice : sel === "monthly" ? monthlyPrice : singlePrice;
  const payLabel = paying ? "Opening payment…"
    : sel === "full" ? `Buy season pass · ${payAmount != null ? money(payAmount) : ""}`
    : sel === "monthly" ? `Subscribe · ${payAmount != null ? money(payAmount) : ""}/mo`
    : `Buy single entry · ${payAmount != null ? money(payAmount) : ""}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }}><Text style={{ color: neutrals.muted, fontSize: 24 }}>‹</Text></TouchableOpacity>
        <SpectrumText style={{ fontSize: 16, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Enter the Season</SpectrumText>
      </View>

      {/* balance — what a credit is, and how many you have */}
      <View style={{ borderRadius: 16, padding: 18, marginBottom: 18, borderWidth: 1.5, borderColor: balance > 0 ? hues.gold.base : neutrals.border, backgroundColor: balance > 0 ? "rgba(230,185,63,0.06)" : "#141216" }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ color: balance > 0 ? hues.gold.hi : neutrals.text, fontSize: 40, fontWeight: "800" }}>{balance}</Text>
          <Text style={{ color: neutrals.muted, fontSize: 15, fontWeight: "700", marginLeft: 8 }}>entry credit{balance === 1 ? "" : "s"}</Text>
        </View>
        <Text style={{ color: neutrals.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
          Each event you enter uses <Text style={{ color: neutrals.text, fontWeight: "700" }}>1 credit</Text>. Enter 2 events in a round and you spend 2.
        </Text>
      </View>

      <Label t="Choose your plan" />
      <Plan
        on={sel === "full"} onPress={() => setSel("full")} best
        title={`Season pass · ${SEASON_CREDITS} credits`}
        blurb={`One payment for the whole season — enough to enter every one of the ${SEASON_CREDITS} tournaments.`}
        right={fullPrice != null ? money(fullPrice) : "—"} rightSub="season"
      />
      <Plan
        on={sel === "monthly"} onPress={() => setSel("monthly")}
        title="Subscription · 1 credit / month"
        blurb="A fresh credit every tournament month, rolling over if unused. Auto-renews, cancel anytime."
        right={monthlyPrice != null ? money(monthlyPrice) : "—"} rightSub="/mo"
      />
      <Plan
        on={sel === "alacarte"} onPress={() => setSel("alacarte")}
        title="Single entry · 1 credit"
        blurb="Just enter one event. One credit, one payment — no commitment."
        right={singlePrice != null ? money(singlePrice) : "—"} rightSub="once"
      />

      <TouchableOpacity onPress={pay} disabled={paying} activeOpacity={0.9} style={{ marginTop: 18, opacity: paying ? 0.5 : 1 }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14, paddingVertical: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{payLabel}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <Text style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16 }}>
        {sel === "monthly" ? "Renews on the 1st of each tournament month. Cancel anytime." : "Credits are spent when you enter an event, from the Compete tab."}
      </Text>
    </ScrollView>
  );
}

function Plan({ on, onPress, title, blurb, right, rightSub, best }: { on: boolean; onPress: () => void; title: string; blurb: string; right: string; rightSub: string; best?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ marginBottom: 10 }}>
      <View style={{ borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: on ? hues.gold.base : neutrals.border, backgroundColor: on ? "rgba(230,185,63,0.06)" : "#141216", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ color: neutrals.text, fontSize: 16, fontWeight: "800" }}>{title}{best ? "  ·  best value" : ""}</Text>
          <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>{blurb}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: on ? hues.gold.hi : neutrals.text, fontSize: 20, fontWeight: "800" }}>{right}</Text>
          <Text style={{ color: neutrals.muted2, fontSize: 10 }}>{rightSub}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function Label({ t }: { t: string }) {
  return <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800", marginBottom: 10 }}>{t}</Text>;
}
