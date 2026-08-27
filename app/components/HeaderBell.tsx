import { View, Text, TouchableOpacity } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";

// The alerts bell + unread badge, for screens that render their OWN header
// (Compete, Profile) and so don't get the app-level <Header/>. Same look as the
// Header bell; tap opens the AlertsSheet (wired from App via onPress).
export function HeaderBell({ unread = 0, onPress }: { unread?: number; onPress?: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={{ fontSize: 18 }}>🔔</Text>
      {unread > 0 ? (
        <View style={{ position: "absolute", top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: hues.ruby.base, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: neutrals.bg }}>
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
export default HeaderBell;
