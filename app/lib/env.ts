// Centralized public Supabase credentials.
//
// In development the Expo dev server populates EXPO_PUBLIC_* at runtime, but this
// project's release builds do NOT inline EXPO_PUBLIC_* (there's no babel-preset-expo
// wiring), so in a production bundle `process.env.EXPO_PUBLIC_SUPABASE_*` is empty and
// every request failed with "No API key found in request". These hardcoded fallbacks
// guarantee the values are present in release. The anon key is a PUBLIC client key —
// row-level security is the actual security boundary — so keeping it in source is
// expected and safe (it ships in the bundle either way).
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || "https://oxzuavpyoetchwebdejp.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enVhdnB5b2V0Y2h3ZWJkZWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjgyNjUsImV4cCI6MjEwMTU0NDI2NX0.SEBXeo_FqsyqV8xS5dwaGymXI6mYPy8-9uMAgaX4fhg";
