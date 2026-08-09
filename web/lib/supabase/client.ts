import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Auth is password + reset (D6); implicit flow so email
// links return a hash token (not a browser-bound PKCE code) — the lesson from the
// member staff.html.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit" } },
  );
}
