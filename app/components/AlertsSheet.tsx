import { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";
import { listNotifications, markRead, markAllRead, type Notif } from "../lib/notifications";

// The alerts sheet (bell → bottom sheet). Lists notifications; tapping one marks
// it read and routes via onSelect (deep-link contract §1).
export function AlertsSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (n: Notif) => void }) {
  const [items, setItems] = useState<Notif[] | null>(null);

  useEffect(() => { if (visible) { setItems(null); listNotifications().then(setItems); } }, [visible]);

  function open(n: Notif) { if (!n.read) markRead(n.id); onSelect(n); }
  function clearAll() { markAllRead(); setItems((it) => it?.map((n) => ({ ...n, read: true })) ?? it); }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: neutrals.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "72%", paddingBottom: 26 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
            <Text style={{ color: neutrals.text, fontWeight: "800", fontSize: 15 }}>Alerts</Text>
            <TouchableOpacity onPress={clearAll}><Text style={{ color: hues.gold.hi, fontSize: 12 }}>Mark all read</Text></TouchableOpacity>
          </View>
          {items == null ? (
            <View style={{ padding: 34, alignItems: "center" }}><ActivityIndicator color={neutrals.muted} /></View>
          ) : items.length === 0 ? (
            <Text style={{ color: neutrals.muted2, textAlign: "center", padding: 34 }}>No alerts yet.</Text>
          ) : (
            <ScrollView>
              {items.map((n) => (
                <TouchableOpacity key={n.id} onPress={() => open(n)} activeOpacity={0.8} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: neutrals.border, flexDirection: "row", alignItems: "center" }}>
                  {!n.read ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: hues.gold.base, marginRight: 10 }} /> : <View style={{ width: 17 }} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: neutrals.text, fontWeight: n.read ? "500" : "700", fontSize: 13 }}>{n.title}</Text>
                    {n.body ? <Text style={{ color: neutrals.muted2, fontSize: 11, marginTop: 2 }} numberOfLines={2}>{n.body}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default AlertsSheet;
