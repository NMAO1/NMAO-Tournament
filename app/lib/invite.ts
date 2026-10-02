// Invite a friend — Level 1 (plain native share sheet, no tracking).
// Shares a message + App Store link; if the competitor's school has a join
// code, it's included so the friend lands in the same dojo. A future Level 2
// adds a personalized referral link + deferred deep link (see backlog).
import { Share } from "react-native";

// NMAO Compete on the App Store (ASC app id 6812842694).
export const APP_STORE_URL = "https://apps.apple.com/app/id6812842694";

export function buildInviteMessage(opts: { schoolName?: string | null; joinCode?: string | null }): string {
  const { schoolName, joinCode } = opts;
  const lines: string[] = [];
  lines.push("Come compete with me on NMAO Compete — the martial arts tournament app. Earn a rating, duel rivals, and collect badges.");
  if (joinCode) {
    lines.push("");
    lines.push(schoolName ? `Join ${schoolName} with school code ${joinCode}.` : `Use school code ${joinCode} to join my dojo.`);
  }
  lines.push("");
  lines.push(`Download: ${APP_STORE_URL}`);
  return lines.join("\n");
}

export async function shareInvite(opts: { schoolName?: string | null; joinCode?: string | null }): Promise<boolean> {
  try {
    const message = buildInviteMessage(opts);
    const res = await Share.share({ message });
    return res.action === Share.sharedAction;
  } catch {
    return false;
  }
}
