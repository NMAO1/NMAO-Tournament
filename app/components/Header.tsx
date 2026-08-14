import { View, Text, TouchableOpacity } from "react-native";
import { neutrals, hues } from "@nmao/design-tokens";

// The app header — screen title on the left, alerts bell (with unread count) on
// the right. Alerts live here, not as a tab. Deep-link routing (§1) fires from
// tapping the bell → the alerts sheet.

export function Header({
  title,
  unread = 0,
  onBell,
}: {
  title: string;
  unread?: number;
  onBell?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 18,
        paddingTop: 56,
        paddingBottom: 12,
      }}
    >
      <Text
        style={{
          color: neutrals.text,
          fontSize: 16,
          fontWeight: "800",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>

      <TouchableOpacity onPress={onBell} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ fontSize: 18 }}>🔔</Text>
        {unread > 0 ? (
          <View
            style={{
              position: "absolute",
              top: -3,
              right: -5,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              paddingHorizontal: 3,
              backgroundColor: hues.ruby.base,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: neutrals.bg,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export default Header;
