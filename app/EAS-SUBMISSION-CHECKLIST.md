# Compete (us.nmao.compete) — EAS build env / "secrets" checklist

## What the app actually needs at build time

The app reads **only two** runtime env vars, both `EXPO_PUBLIC_*` (so they're
inlined into the client bundle at build time). Both are **publishable** — the
Supabase anon key is meant to ship in the client — so they're not true secrets,
but they MUST be present in the EAS build environment or the production build
ships pointing at nothing.

| Var | Value | Where it lives today |
|-----|-------|----------------------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://oxzuavpyoetchwebdejp.supabase.co` | `app/.env.local` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | tournament project anon/publishable key | `app/.env.local` (or Supabase → Project Settings → API → anon public) |

**No in-app Stripe key.** Entry payments open a hosted **Stripe Checkout in the
browser** (server EF `create-entitlement-checkout`), so the live Stripe keys live
in **Supabase Edge Function secrets**, never in this app build. (That's ops item
#2 — separate from this checklist.)

## Set them as EAS env vars (production + preview)

From `app/` — the anon key value is in `app/.env.local`:

```bash
# URL (public)
npx eas-cli env:create --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://oxzuavpyoetchwebdejp.supabase.co" \
  --visibility plaintext --non-interactive

# anon key (publishable; 'sensitive' hides it from logs but it's still inlined at build)
npx eas-cli env:create --environment production \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "PASTE_FROM_app/.env.local" \
  --visibility sensitive --non-interactive
```

Repeat both with `--environment preview` if you want internal (preview) builds to
work too. Then confirm:

```bash
npx eas-cli env:list production
```

## Build + submit

```bash
npx eas-cli build   --profile production --platform ios
npx eas-cli submit  --profile production --platform ios   # needs the ASC app record + API key
```

Notes:
- `app.json` marketing version = **1.0.0**; `eas.json` production has
  `autoIncrement: true` + `appVersionSource: remote`, so the **build number
  auto-increments remotely** — no manual `buildNumber` bump needed.
- owner `nmao3`, projectId `f410fb85-09ed-41bf-bd1f-6cec899e8df3`, bundle
  `us.nmao.compete`, Team ID `BYS8GWQB7Y`.
- `submit.production` in eas.json is `{}` — add the App Store Connect API key (or
  use interactive submit) once the ASC record exists.

## Universal links (AASA) — done on the web side

- `app.json` → `ios.associatedDomains = ["applinks:compete.nmao.us"]` ✅
- Served AASA now carries the **real** appID `BYS8GWQB7Y.us.nmao.compete`
  (fixed in the `NMAO1/NMAO-Compete-Web` repo — **push that repo** to deploy).
- After the Compete-Web push, re-verify:
  ```bash
  curl -s https://compete.nmao.us/.well-known/apple-app-site-association
  # expect appID BYS8GWQB7Y.us.nmao.compete, paths ["/invite*"]
  ```
- Still TODO on the web side: `invite/index.html` has `APPSTORE_ID_PLACEHOLDER`
  — fill the numeric App Store ID once the App Store Connect record exists.
