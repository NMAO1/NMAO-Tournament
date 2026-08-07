// Ambient shims so `tsc` can type-check the Deno edge-function sources
// (Supabase JSR import + the Deno global) without a Deno toolchain.
// These are NOT used at runtime — Deno resolves the real modules.
declare module 'jsr:@supabase/supabase-js@2' {
  // deno-lint-ignore no-explicit-any
  export type SupabaseClient = any;
  // deno-lint-ignore no-explicit-any
  export function createClient(...args: any[]): any;
}
declare const Deno: {
  env: { get(key: string): string | undefined };
  // deno-lint-ignore no-explicit-any
  serve: (handler: any) => any;
};
