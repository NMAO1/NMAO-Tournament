// Public Supabase credentials, hardcoded literals (no process.env — release
// builds don't inline EXPO_PUBLIC_*, and any stale EAS-injected value must not
// win). The anon key is a PUBLIC client key — row-level security is the real
// boundary — so keeping it in source is expected and safe.
export const SUPABASE_URL = "https://oxzuavpyoetchwebdejp.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enVhdnB5b2V0Y2h3ZWJkZWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NjgyNjUsImV4cCI6MjEwMTU0NDI2NX0.SEBXeo_FqsyqV8xS5dwaGymXI6mYPy8-9uMAgaX4fhg";
