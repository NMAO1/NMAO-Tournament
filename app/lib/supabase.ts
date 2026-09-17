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

// Force the anon key onto every request. In release (Hermes) builds the
// `apikey` header set by supabase-js was not reaching Supabase — every call
// failed with "No API key found in request" — even though the key is embedded
// (verified in-bundle) and the identical client works in Node. Wrapping fetch
// and setting the headers ourselves guarantees the key is always present, and
// pins Supabase to React Native's global fetch.
const fetchWithKey: typeof fetch = (input, init) => {
  const h: Record<string, string> = { ...((init?.headers as Record<string, string>) ?? {}) };
  h.apikey = SUPABASE_ANON_KEY;
  if (!h.Authorization && !h.authorization) h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  return fetch(input, { ...init, headers: h });
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
