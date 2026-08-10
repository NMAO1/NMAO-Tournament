# Overnight brief — 2026-08-09 → morning

Everything below is **written + typechecked**, nothing deployed (deploys/sim are yours). Two features + your badge art received.

## 1. Enhanced medal (Reveal) — reload to see
`app/screens/Reveal.tsx` — the medal now does a **3D spin-in + curved swirl entrance + shine sweep + metallic bevel + pulsing glow** (built on the RN Animated stack, no Skia risk). The full Skia rewrite (and rendering your real emblem art) is staged for when you're here to watch it.
- **See it:** `cd ~/Documents/GitHub/NMAO-Tournament/app && npx expo start --dev-client`, open the app, tap the "Your result is in" banner. (Your real result is a non-place, so you'll get the soft tone + saying; ask me for the 1st+gold preview SQL to see the fanfare/medal.)

## 2. Recuse flow (closes the judge side)
- **EF:** `supabase/functions/recuse-assignment/index.ts` — a judge recuses from an entry (conflict of interest). Verifies caller is the assigned judge, refuses if already submitted, deletes the assignment, audits it. **Deploy:**
  ```
  supabase functions deploy recuse-assignment --project-ref oxzuavpyoetchwebdejp
  ```
- **UI:** a **Recuse** link now sits next to Score on each queue card (`web/app/(judge)/judge/page.tsx`) — auto-live on the running web dev server.
- **Note:** recuse removes the assignment, leaving the pod short a judge → staff re-runs **assign_judges** to backfill. (A smarter auto-reassign is a later improvement.)

## 3. Your badge art — received, staged
You shared ~7 illustrated emblems (gold dragon, tiger-eye, archery target, lotus, glory-fist 栄, and the **Perfect-Season Champion LTD ED 001/500** rainbow dragon). These reshape the medal/badge plan: the Reveal should spin/shine **these real emblems**, not CSS discs. I couldn't pull chat images to disk overnight — so to wire them, I need either:
- the **PNG files dropped into `app/assets/badges/`** (I'll render them in the medal + badge-unlock with the spin/shine treatment), **or**
- them uploaded to a Supabase `badge-emblems` bucket keyed by `badges.emblem_key` (better long-term; I'll build the seam).

## To fully build the badge-unlock sequence, I need from you
1. The **emblem files** (above).
2. **Badge definitions + earn-rules** — for each badge: `code`, `name`, `category`, `rarity`, `tiered?`, and **what unlocks it** (the `earn_rule`, e.g. "first entry", "3-round streak", "perfect season", "top-10% rating"). Then I wire real `badge_awards` on resolve + the unlock reveal.

## 4. Badge-unlock system — BUILT (dormant until you award badges)
Safe autonomous work while you were out. All typechecked; renders nothing until `badge_awards` exist.
- **Bucket:** `supabase/migrations/20260810400000_badge_emblems_bucket.sql` — a PUBLIC `badge-emblems` bucket for your art, keyed by `badges.emblem_key`. Run it, then upload the emblem PNGs there (dashboard).
- **App:** `lib/badges.ts` (fetch unseen awards + mark-seen + public emblem URL), `screens/BadgeUnlock.tsx` (a badge pops in with a spring + rarity glow; shows your emblem art if uploaded, else a rarity-gradient fallback disc), wired into `Reveal.tsx` as a new **"badges" phase**: after the result, if you have unseen awards the Continue button becomes **"See what you unlocked →"** and reveals them; the `seen` flag flips on Continue so it only fires once.
- **PREVIEW it:** run `supabase/seed_badge_preview.sql` (awards you an Uncommon + a Legendary), then reveal a result → tap "See what you unlocked →". Upload real art + set `emblem_key` (e.g. `perfect_season_champion.png`) to replace the fallback discs with your dragons.
- **What's still yours:** the emblem PNGs, and the real **earn-rules** (`badges.earn_rule` + logic to INSERT `badge_awards` on resolve). I built everything that reads/reveals; awarding-on-resolve waits on your rules.

## Still-pending deploys from earlier (one place)
- **Pod cap 15/16 + sayings read policy:** run `supabase/migrations/20260810300000_pod_cap_15_and_sayings_read.sql` in the SQL editor (for the Reveal's motivational saying + smaller pods).
- **recuse-assignment EF:** the deploy command above.
