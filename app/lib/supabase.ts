import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

// Session stored in the device secure enclave. Auth is password + reset (D6);
// implicit flow, no URL detection (native).
const SecureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// React Native 0.86 release builds (New Architecture) were dropping request
// headers, so Supabase's `apikey`/`Authorization` never reached the gateway
// ("No API key found in request") — verified: a raw fetch with the header got
// 401, while the same header via curl/Node gets 200. Two belt-and-suspenders
// mitigations: (1) put the apikey in the URL (the gateway accepts ?apikey=, and
// URL params are not affected by the header bug); (2) pass headers as a Headers
// instance, which serializes reliably where a plain object did not.
const fetchWithKey: typeof fetch = (input, init) => {
  let url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
  if (!url.includes("apikey=")) {
    url += (url.includes("?") ? "&" : "?") + "apikey=" + encodeURIComponent(SUPABASE_ANON_KEY);
  }
  const headers = new Headers((init?.headers as HeadersInit) ?? {});
  headers.set("apikey", SUPABASE_ANON_KEY);
  if (!headers.has("authorization")) headers.set("authorization", `Bearer ${SUPABASE_ANON_KEY}`);
  return fetch(url, { ...init, headers });
};

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: SecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
    global: {
      fetch: fetchWithKey,
      headers: { apikey: SUPABASE_ANON_KEY },
    },
  },
);
