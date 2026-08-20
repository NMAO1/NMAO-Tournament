import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Modal, Linking } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { neutrals, hues } from "@nmao/design-tokens";
import { supabase } from "./lib/supabase";
import { myCompetitors } from "./lib/competitors";
import { useActiveCompetitor } from "./lib/activeCompetitor";
import { unreadCount, subscribeNotifications, latestUnseenMonthly, type Notif } from "./lib/notifications";
import Login from "./screens/Login";
import Signup from "./screens/Signup";
import Onboard from "./screens/Onboard";
import InviteRedeem from "./screens/InviteRedeem";
import Compete from "./screens/Compete";
import Duel from "./screens/Duel";
import Achievements from "./screens/Achievements";
import Leaderboard from "./screens/Leaderboard";
import Profile from "./screens/Profile";
import DuelReveal from "./screens/DuelReveal";
import MonthlyReveal from "./screens/MonthlyReveal";
import { Header } from "./components/Header";
import { AlertsSheet } from "./components/AlertsSheet";

// 5-tab shell (spec §1): Compete · Duel · Achievements · Leaderboard · Profile.
// Alerts = header bell (not a tab). App opens on Duel (the Arena).
type Tab = "compete" | "duel" | "achievements" | "leaderboard" | "profile";
type ActiveReveal = { kind: "duel"; duelId: string } | { kind: "monthly"; period: string; payload: Record<string, unknown> };

const TABS: { key: Tab; label: string; title: string; icon: string; hue: string; ownHeader?: boolean }[] = [
  { key: "compete", label: "Compete", title: "Compete", icon: "🥋", hue: hues.sapphire.hi, ownHeader: true },
  { key: "duel", label: "Duel", title: "The Arena", icon: "⚔️", hue: hues.ruby.hi },
  { key: "achievements", label: "Honors", title: "Honors", icon: "🎖️", hue: hues.amethyst.hi },
  { key: "leaderboard", label: "Leaderboard", title: "Leaderboard", icon: "🏆", hue: hues.gold.hi },
  { key: "profile", label: "Profile", title: "Profile", icon: "👤", hue: hues.gold.hi, ownHeader: true },
];

function MainTabs() {
  const [tab, setTab] = useState<Tab>("duel");
  // shared active ward — so a guardian with >1 competitor sees the same child everywhere
  const { comps, activeId, setActive } = useActiveCompetitor();
  const myId = activeId;
  const [unread, setUnread] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [reveal, setReveal] = useState<ActiveReveal | null>(null);
  const active = TABS.find((t) => t.key === tab)!;

  useEffect(() => {
    (async () => {
      setUnread(await unreadCount());
      const m = await latestUnseenMonthly();
      if (m) setReveal({ kind: "monthly", period: m.period, payload: m.payload }); // auto-detect on launch (§8b)
    })();
  }, []);

  // Subscribe to notifications filtered to this user's competitor(s) — re-subscribes
  // once the ward list loads. Filtering routes server-side (no whole-table fan-out).
  const compKey = comps.map((c) => c.id).join(",");
  useEffect(() => {
    const ids = compKey ? compKey.split(",") : undefined;
    const unsub = subscribeNotifications(() => { unreadCount().then(setUnread); }, ids);
    return unsub;
  }, [compKey]);

  function routeNotif(n: Notif) {
    setAlertsOpen(false);
    const duelId = typeof n.data?.duel_id === "string" ? (n.data.duel_id as string) : null;
    if (n.type === "reveal_ready") { latestUnseenMonthly().then((m) => m && setReveal({ kind: "monthly", period: m.period, payload: m.payload })); return; }
    if (duelId && n.type === "duel_result") { setReveal({ kind: "duel", duelId }); return; }
    if (duelId) { setTab("duel"); }
  }

  return (
    <View style={{ flex: 1 }}>
      {!active.ownHeader ? <Header title={active.title} unread={unread} onBell={() => setAlertsOpen(true)} /> : null}

      {/* ward picker — a guardian with more than one competitor switches child here
          (Compete has its own picker; it drives the same shared selection). */}
      {comps.length > 1 && tab !== "compete" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: neutrals.bg }}>
          {comps.map((c) => {
            const on = c.id === activeId;
            return (
              <TouchableOpacity key={c.id} onPress={() => setActive(c.id)} style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 99, backgroundColor: on ? hues.gold.base : "transparent", borderWidth: 1, borderColor: on ? hues.gold.base : neutrals.border }}>
                <Text style={{ color: on ? "#141210" : neutrals.muted, fontWeight: "700", fontSize: 12 }}>{c.first_name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === "compete" ? <Compete /> : null}
        {tab === "duel" ? <Duel /> : null}
        {tab === "achievements" ? <Achievements /> : null}
        {tab === "leaderboard" ? <Leaderboard /> : null}
        {tab === "profile" ? <Profile /> : null}
      </View>

      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: neutrals.border, backgroundColor: "#0b0b0c", paddingTop: 8, paddingBottom: 26 }}>
        {TABS.map((t) => (
          <TabButton key={t.key} label={t.label} icon={t.icon} hue={t.hue} active={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>

      <AlertsSheet visible={alertsOpen} onClose={() => setAlertsOpen(false)} onSelect={routeNotif} />

      <Modal visible={!!reveal} animationType="fade" onRequestClose={() => setReveal(null)}>
        {reveal?.kind === "duel" ? <DuelReveal duelId={reveal.duelId} myId={myId} onClose={() => setReveal(null)} /> : null}
        {reveal?.kind === "monthly" ? <MonthlyReveal period={reveal.period} payload={reveal.payload} onClose={() => setReveal(null)} /> : null}
      </Modal>
    </View>
  );
}

function TabButton({ label, icon, hue, active, onPress }: { label: string; icon: string; hue: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flex: 1, alignItems: "center" }}>
      {/* bento pill — the active tab sits in a rounded compartment in its hue */}
      <View style={{ alignItems: "center", paddingHorizontal: 12, paddingTop: 6, paddingBottom: 5, borderRadius: 14, backgroundColor: active ? hue + "1F" : "transparent", borderWidth: 1, borderColor: active ? hue + "66" : "transparent" }}>
        <Text style={{ fontSize: 16, marginBottom: 2, opacity: active ? 1 : 0.45 }}>{icon}</Text>
        <Text numberOfLines={1} style={{ color: active ? hue : neutrals.muted2, fontWeight: active ? "800" : "500", fontSize: 9.5, letterSpacing: 0.1 }}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

// Pull a bridge invite token out of a deep-link, e.g.
// nmao-compete://invite?t=… or https://compete.nmao.us/invite?t=…
function parseInviteToken(url: string | null): string | null {
  if (!url || !/invite/i.test(url)) return null;
  const m = url.match(/[?&]t=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [hasComp, setHasComp] = useState<boolean | undefined>(undefined);
  const [authView, setAuthView] = useState<"login" | "signup">("login");
  const [redeemToken, setRedeemToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) setAuthView("login"); });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Invite deep-link (Membership bridge) — capture the token on cold launch and
  // while running; it survives the guardian signing up before they redeem.
  useEffect(() => {
    Linking.getInitialURL().then((u) => { const t = parseInviteToken(u); if (t) setRedeemToken(t); });
    const sub = Linking.addEventListener("url", ({ url }) => { const t = parseInviteToken(url); if (t) setRedeemToken(t); });
    return () => sub.remove();
  }, []);

  // A signed-in user with no competitor yet (fresh guardian) goes to onboarding.
  useEffect(() => {
    if (!session) { setHasComp(undefined); return; }
    let alive = true;
    setHasComp(undefined);
    myCompetitors().then((cs) => { if (alive) setHasComp(cs.length > 0); });
    return () => { alive = false; };
  }, [session]);

  const spinner = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={neutrals.muted} /></View>
  );

  let body: React.ReactNode;
  if (session === undefined) body = spinner;
  else if (!session) body = authView === "signup" ? <Signup onBack={() => setAuthView("login")} /> : <Login onSignup={() => setAuthView("signup")} />;
  // A pending invite redeems ahead of the normal gate — even for an existing
  // guardian adding an invited competitor. Auth-first: if not signed in above,
  // the token is held until they are, then this shows.
  else if (redeemToken) body = <InviteRedeem token={redeemToken} onDone={() => { setRedeemToken(null); setHasComp(true); }} onCancel={() => setRedeemToken(null)} />;
  else if (hasComp === undefined) body = spinner;
  else if (!hasComp) body = <Onboard onDone={() => setHasComp(true)} />;
  else body = <MainTabs />;

  return (
    <View style={{ flex: 1, backgroundColor: neutrals.bg }}>
      <StatusBar style="light" />
      {body}
    </View>
  );
}
