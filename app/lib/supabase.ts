import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

// Session stored in the device secure enclave. Auth is password + reset (D6);
// implicit flow, no URL detection (native).
const SecureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Public Supabase creds. Primary source is EXPO_PUBLIC_* (populated in dev, and in
// release builds only when EXPO_PUBLIC inlining is wired — which this project's
// babel setup does NOT do). The hardcoded fallbacks guarantee the client still
// initializes in a production bundle; without them the app shipped with an empty
// key and every request failed "No API key found in request". The anon key is a
// public client key (RLS is the security boundary), so keeping it in source is safe.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://oxzuavpyoetchwebdejp.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enVhdnB5b2V0Y2h3ZWJkZWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjgyNjUsImV4cCI6MjEwMTU0NDI2NX0.SEBXeo_FqsyqV8xS5dwaGymXI6mYPy8-9uMAgaX4fhg";

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
  },
);
