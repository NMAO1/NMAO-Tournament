import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { neutrals, hues, spectrumStops } from "@nmao/design-tokens";
import { loadPricing, createEntitlementCheckout, myEntitlements, creditSummary, SEASON_CREDITS, type Lane, type PricingTier } from "../lib/pricing";
import { SpectrumText } from "../components/SpectrumText";

const money = (c: number) => `$${(c / 100).toFixed(0)}`;
type Sel = { kind: "full" } | { kind: "monthly" } | { kind: "topup" };

// Entry credits: a season pass is a BUCKET of credits. Each event you enter in a
// round spends 1 credit. You buy a bucket (or top up), then claim events per round
// from the Compete tab. Payment is Stripe hosted Checkout in the browser (no IAP).
export default function BuyEntry({ competitorId, onClose, onPaid }: { competitorId: string; onClose: () => void; onPaid: () => void }) {
  const [tiers, setTiers] = useState<PricingTier[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [sel, setSel] = useState<Sel>({ kind: "full" });
  const [qty, setQty] = useState(3);
  const [paying, setPaying] = useState(false);

  const refreshBalance = () => creditSummary(competitorId).then((s) => setBalance(s.credits_remaining));
  useEffect(() => { loadPricing().then(setTiers); refreshBalance(); }, []);

  const priceOf = (l: Lane) => tiers?.find((t) => t.lane === l && t.event_slots === 1)?.unit_amount_cents;
  const fullPrice = priceOf("full");
  const monthlyPrice = priceOf("monthly");
  const perCredit = fullPrice ? Math.round(fullPrice / SEASON_CREDITS) : undefined;

  async function pay() {
    setPaying(true);
    try {
      const input = sel.kind === "topup"
        ? { competitor_id: competitorId, lane: "topup" as Lane, credits: qty }
        : { competitor_id: competitorId, lane: sel.kind as Lane, event_slots: 1 };
      const res = await createEntitlementCheckout(input);
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
        const added = sel.kind === "full" ? SEASON_CREDITS : sel.kind === "topup" ? qty : 1;
        Alert.alert("Credits added", `${added} entry credit${added === 1 ? "" : "s"} added. Enter your events from the Compete tab — each event uses 1 credit.`);
        onPaid();
      } else {
        Alert.alert("Almost there", "If you completed payment, your credits will appear in a moment.");
      }
    } catch (e: any) { setPaying(false); Alert.alert("Payment", e?.message || "Something went wrong."); }
  }

  if (!tiers || balance === null) {
    return <View style={{ flex: 1, backgroundColor: neutrals.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>;
  }

  const payAmount = sel.kind === "full" ? fullPrice : sel.kind === "monthly" ? monthlyPrice : (perCredit ? perCredit * qty : undefined);
  const payLabel = paying ? "Opening payment…"
    : sel.kind === "full" ? `Buy season pass · ${payAmount != null ? money(payAmount) : ""}`
    : sel.kind === "monthly" ? `Subscribe · ${payAmount != null ? money(payAmount) : ""}/mo`
    : `Buy ${qty} credit${qty === 1 ? "" : "s"} · ${payAmount != null ? money(payAmount) : ""}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: neutrals.bg }} contentContainerStyle={{ padding: 18, paddingTop: 54, paddingBottom: 40 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 18 }}>
        <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }}><Text style={{ color: neutrals.muted, fontSize: 24 }}>‹</Text></TouchableOpacity>
        <SpectrumText style={{ fontSize: 16, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" }}>Entry Credits</SpectrumText>
      </View>

      {/* balance — what a credit is, and how many you have */}
      <View style={{ borderRadius: 16, padding: 18, marginBottom: 8, borderWidth: 1.5, borderColor: balance > 0 ? hues.gold.base : neutrals.border, backgroundColor: balance > 0 ? "rgba(230,185,63,0.06)" : "#141216" }}>
        <View style={{ flexDirection: "row", alignItems: "baseline" }}>
          <Text style={{ color: balance > 0 ? hues.gold.hi : neutrals.text, fontSize: 40, fontWeight: "800" }}>{balance}</Text>
          <Text style={{ color: neutrals.muted, fontSize: 15, fontWeight: "700", marginLeft: 8 }}>entry credit{balance === 1 ? "" : "s"}</Text>
        </View>
        <Text style={{ color: neutrals.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
          Each event you enter uses <Text style={{ color: neutrals.text, fontWeight: "700" }}>1 credit</Text>. Enter 2 events in a round and you spend 2.
          {balance === 0 ? "  You're out — top up below." : ""}
        </Text>
      </View>

      <Label t="Season plans" />
      <Plan
        on={sel.kind === "full"} onPress={() => setSel({ kind: "full" })}
        title={`Season pass · ${SEASON_CREDITS} credits`} best
        blurb={`One payment for the whole season — enough to enter every one of the ${SEASON_CREDITS} tournaments.`}
        right={fullPrice != null ? money(fullPrice) : "—"} rightSub="season"
      />
      <Plan
        on={sel.kind === "monthly"} onPress={() => setSel({ kind: "monthly" })}
        title="Monthly · 1 credit / month"
        blurb="A fresh credit every tournament month, rolling over if unused. Auto-renews, cancel anytime."
        right={monthlyPrice != null ? money(monthlyPrice) : "—"} rightSub="/mo"
      />

      <View style={{ height: 14 }} />
      <Label t="Buy more credits" />
      <TouchableOpacity activeOpacity={0.9} onPress={() => setSel({ kind: "topup" })}>
        <View style={{ borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: sel.kind === "topup" ? hues.sapphire.base : neutrals.border, backgroundColor: sel.kind === "topup" ? "rgba(31,123,255,0.08)" : "#141216" }}>
          <Text style={{ color: neutrals.text, fontSize: 15, fontWeight: "800" }}>Top up at the season rate</Text>
          <Text style={{ color: neutrals.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>Buy any number of extra credits — same discounted per-entry price as the season pass{perCredit != null ? ` (${money(perCredit)} each)` : ""}.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Stepper label="−" onPress={() => { setSel({ kind: "topup" }); setQty((q) => Math.max(1, q - 1)); }} />
              <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "800", minWidth: 34, textAlign: "center" }}>{qty}</Text>
              <Stepper label="+" onPress={() => { setSel({ kind: "topup" }); setQty((q) => Math.min(20, q + 1)); }} />
              <Text style={{ color: neutrals.muted2, fontSize: 12 }}>credit{qty === 1 ? "" : "s"}</Text>
            </View>
            <Text style={{ color: sel.kind === "topup" ? hues.sapphire.hi : neutrals.text, fontSize: 18, fontWeight: "800" }}>{perCredit != null ? money(perCredit * qty) : "—"}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity onPress={pay} disabled={paying} activeOpacity={0.9} style={{ marginTop: 20, opacity: paying ? 0.5 : 1 }}>
        <LinearGradient colors={spectrumStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14, paddingVertical: 16, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{payLabel}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <Text style={{ color: neutrals.muted2, fontSize: 11, textAlign: "center", marginTop: 10, lineHeight: 16 }}>
        {sel.kind === "monthly" ? "Renews on the 1st of each tournament month. Cancel anytime." : "Credits are spent when you enter an event, from the Compete tab."}
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

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ width: 38, height: 38, borderRadius: 11, borderWidth: 1, borderColor: neutrals.border, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: neutrals.text, fontSize: 22, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Label({ t }: { t: string }) {
  return <Text style={{ color: hues.gold.hi, fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: "800", marginBottom: 10 }}>{t}</Text>;
}
