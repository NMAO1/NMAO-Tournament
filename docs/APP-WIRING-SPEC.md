# NMAO Tournament — Competitor App Wiring Spec

**The crown jewel.** This is the build contract for the competitor Expo app: every screen → the exact RPCs/tables it reads and writes → data shapes → motion/UX. Backend (dueling Phase 1) is live and smoke-tested; this doc wires the app to it.

- **Project:** Supabase `oxzuavpyoetchwebdejp` · repo `NMAO1/NMAO-Tournament` (`~/Documents/GitHub/NMAO-Tournament`)
- **App stack:** Expo ~57 · RN 0.86 · @shopify/react-native-skia · expo-haptics · expo-linear-gradient · expo-audio/video · expo-secure-store · @supabase/supabase-js. Hand-rolled screen state in `App.tsx` (no navigator lib).
- **Design anchor:** `scratchpad/arena-mockup.html` (published). Dojo-luxe, dark-committed.
- **Companion specs:** `docs/DUELING-DECISIONS.md` (locked rules), `docs/DUELING-HANDOFF.md` (backend map).

---

## 0. Design tokens (from the anchor — use these exact values)

```ts
export const T = {
  void:'#0B0A08', ink:'#141109', panel:'#1B1710', panel2:'#221D12',
  line:'#2E2718', line2:'#413720',
  gold:'#E6B93F', goldDeep:'#B98F28', goldSoft:'rgba(230,185,63,.14)',
  ruby:'#E24B4A', amethyst:'#A78BDA', sapphire:'#4C97E4', jade:'#8FC65A',
  cream:'#F3ECDA', muted:'#A99F88', faint:'#726A55',
};
// Rarity → frame color (equipped badge frame ringing each video / avatar)
export const RARITY = {
  common:'#A99F88', rare:T.sapphire, epic:T.amethyst, legendary:T.gold,
};
```
- **Type:** display/labels uppercase + letter-spacing (`.12–.18em`); body sans; mono (`SF Mono`) for stats, timers, chips.
- **Motion baseline:** 200–260ms ease for transitions; haptics on every commit; `prefers-reduced-motion` → cut particles, keep color/opacity confirms.
- **Frame glow:** `shadow` + 1px inner ring in the rarity color. This is the single reusable primitive (`<Frame rarity avatarOrVideo/>`) used in Arena, Achievements, Leaderboard, Profile.

---

## 1. Navigation shell

**5 bottom tabs** (center = Duel, gold when active): `Compete · Duel · Achievements · Leaderboard · Profile`.
**Header** on every tab: left = screen title/brand, right = **alerts bell** with unread count.

```ts
type Tab = 'compete'|'duel'|'achievements'|'leaderboard'|'profile';
const [tab,setTab] = useState<Tab>('duel');   // app opens on Duel (the vote queue)
```
- Tab switch: crossfade 180ms, no slide (keeps it calm/premium).
- Bell badge count = unread `notifications` (see §7). Tapping bell → Alerts sheet (modal over current tab), not a tab.
- **Deep-link contract** for push taps: `data.duel_id` → open Duel tab, focus that duel; `data.period` → open Reveal. Wire a single `handleNotificationRoute(data)` used by both the bell list and cold-start push.

---

## 2. DUEL tab — the Arena (hero screen)

**Orientation model (locked):** the app is **portrait** for navigation. The Duel tab (portrait) is a **two-section hub** in a scroll body (tab bar pinned):
- **§ Your duels (Compete)** — weekly-count meter; a **"Challenge a rival"** CTA (→ `find_duel_opponents` → pick → `create_duel`); then your **active-duel cards** with contextual actions: *challenged you* → **Decline/Accept** (`respond_to_duel`), *accepted* → **Upload your form** (`submit_duel_video`, with the upload-deadline countdown), *live* → **● LIVE** (community voting). Each card shows the opponent on a mini badge-color avatar.
- **§ Vote queue** — search + queue cards + "enter the ring" (the voting side, `duel_vote_queue`).
- **Sudden-death CTA banner** pins at top when a votable duel is in overtime. Tapping a queued duel **rotates into an immersive landscape "ring"** (Arena-only landscape) to watch + vote; exiting returns to portrait. Videos are **16:9, side by side, full width**. Implement with `expo-screen-orientation`: lock portrait globally, allow/force landscape only while the ring is mounted (`unlockAsync`/`lockAsync(LANDSCAPE)` on mount, restore `PORTRAIT_UP` on unmount). Anchor: `scratchpad/arena-mockup.html`.

### 2a. Vote queue → Tale of the Path → the ring (the Arena)
Portrait queue = **a search field + a scrollable list** of duel cards. Tap a card → rotate to landscape.

**Season/Round label:** every face-off, reveal, and duel surface shows **"Season N · Round M"** (compact "SN · Round M" where space is tight) — sourced from the current tournament season + round, not hardcoded.

**Opening: "Tale of the Path" (landscape, ~10s or skip).** Before the videos load, a fight-card face-off: NMAO framing ("Tale of the Path" · category · Round N), both competitors' **profile photo / silhouette on their equipped-badge-color spotlight** (crest watermark) slam in, big fight-promo names, center **VS**, and a **stat table** — Team · Style · Rank · Duel Wins · Win Streak · Rating. Auto-advances after ~10s (visible countdown) **or "Enter the arena →"**. Uses the same face-off data as the per-duel reveal §8a (both competitors' tale-of-the-path stats + badge + photo). Then → the ring.

**The ring:**
- Two 16:9 videos side by side, each wrapped in a **large ornate collectible frame** (the equipped badge frame; rarity-colored, corner ornaments, sheen).
- **Nameplate** is small/quiet (name · school on a dark rail) so the forms + frames lead — the badge is NOT in the plate.
- **Badge crest:** each frame wears a glowing crest at top-center = that duelist's *selected* badge. **Tap (mobile) / hover (web)** → popover with the badge **name, rarity, and how-earned** text. Voters learn what a badge takes — aspirational + social. A `?` hint dot signals it's interactive.
- HUD: exit-ring chevron · category chips · bell (top) · watch-to-vote meter (thin) · hidden-tally + countdown (bottom) · a vote button under each frame.
- `<Frame>` primitive gets a `size` prop: `mini` (queue thumbnails, avatars) vs `ring` (the big ornate treatment). Same rarity glow engine.

**Weekly reminder:** the Duel tab shows "**N of 4 duels left this week**" (pips). Read **`duel_week_status(competitor)`** → `{used, weekly_limit, remaining, next_slot_at}`. The cap now lives in `nmao.duel_weekly_cap()` — `create_duel` and this read share it (no drift). When `remaining=0`, show "resets " + `next_slot_at`. Also surface `remaining` at the per-duel reveal's re-entry CTA.

**Queue read — `duel_vote_queue(p_competitor_id, p_limit, p_search?)`** now returns, per duelist: `*_frame_code`, `*_frame_rarity`, **`*_frame_name`, `*_frame_desc`** (badge name + how-earned, for the crest popover — no extra round-trip). `p_search` filters `challenger/opponent name` + `school` server-side (ILIKE), applied before the limit so a specific duel surfaces regardless of page. Debounce the search input ~250ms → re-call with `p_search`.
- ⚠ **Content polish (non-blocking):** `badges.description` currently carries some dev phrasing (`"First ever entry (count(entries)=1)"`). Do a player-facing copy pass on `badges.description` before launch so the crest reads cleanly. The crest shows `frame_desc` verbatim.
**Read — RPC `duel_vote_queue()`** (SECURITY DEFINER, public pool of votable duels not yours-only; returns safe fields). Expected row shape (confirm column names against `20260813000000_dueling_rpcs.sql` at build):
```ts
type QueueDuel = {
  duel_id: string; type: 'kata'|'weapon';
  challenger: { competitor_id:string; name:string; school:string; rank:string;
               frame:{ code:string; rarity:keyof typeof RARITY } | null };
  opponent:   { /* same shape */ };
  closes_vote_at: string; overtime_until: string | null;
  already_voted: boolean;               // hide/disable if true
};
```
**Video URLs — EF `get-playback-url`** with `{ duel_id }` → `{ kind:'duel', challenger:{signedUrl}, opponent:{signedUrl} }`. Auth = verified competitor while the duel is watchable. Fetch lazily on tap (tap-to-play model), not on list render.

**Vote — RPC `cast_duel_vote(p_duel_id, p_choice, p_watched_seconds, p_encouragement_code?)`.**
- `p_choice`: `'challenger'|'opponent'`.
- Server **rejects `watched < 15`** — the client gate mirrors it but the server is the source of truth.
- Unique `(duel_id, voter_competitor_id)` → double-vote returns conflict; treat as "already voted", don't error-toast.
- Optional `encouragement_code` → later maps to reveal's "X competitors backed you".

**UX / motion (locked: tap-to-play each · cinematic vote):**
1. Both sides show a **poster frame** inside the equipped **badge Frame** (rarity glow). Tap a side → plays with audio; tapping the other pauses the first and plays it (compare, never both at once).
2. **Watch-to-vote meter** accumulates *real playback seconds across both clips* toward 15s. Vote buttons are disabled + dimmed until 15s; at 15s they ignite (gold fill for challenger side uses `gold`, opponent side uses that duelist's rarity color per the mockup — or standardize both to gold; pick one at build and keep consistent).
3. **Vote commit = the cinematic moment:** `Haptics.notificationAsync(Success)` → chosen Frame flares (scale 1.0→1.06→1.0, glow bloom) → **Skia particle burst** in the rarity color → card settles with a check. ~700ms. Then auto-advance to next queue duel (250ms slide).
4. **Tally stays hidden** — never render vote counts in the queue. Show only "closes in 22h" (mono).
5. Empty queue → a calm dojo state ("The arena is quiet. Challenge someone from Compete."). Reduced-motion → skip particles, keep the flare as an opacity/color pulse.

### 2b. Your active duels strip (top of Duel tab)
**Read — table `duels`** filtered to yours via RLS (`challenger_id`/`opponent_id` in `nmao.competitor_ids()`). One horizontally-scrolling row of status cards:
```ts
// status → CTA
'pending'  (you are opponent)  → "Respond"  → respond_to_duel(duel_id, accept:bool)
'pending'  (you are challenger)→ "Awaiting response" (no action)
'accepted' (video not yet in)  → "Upload your form" → submit_duel_video(duel_id, path)
'voting'                        → "Live — rally your community" (link to share)
'complete'|'no_contest'         → result chip (win/loss/draw held for reveal — see note)
```
- **Respond — RPC `respond_to_duel(p_duel_id, p_accept)`**: accept → both get 72h upload window; decline → challenger notified.
- **Upload — RPC `submit_duel_video(p_duel_id, p_video_path)`**: client uploads to the private `entry-videos` (duel) bucket first (resumable), then passes the storage path. Same monthly-password/unedited rules as tournament entries — surface them at the upload sheet.
- **Result display note (locked):** badges + rating changes are revealed at the **monthly reveal**, not inline. The active-duel card may show *that* a duel completed and a neutral "see it in your reveal" nudge, but **not** win/loss framing that pre-empts the cush---ioned reveal. Keep losses soft.

### 2c. Sudden-death banner
When any votable duel has `overtime_until > now()`: pin a ruby banner at top — **"SUDDEN DEATH · VOTE NOW · 60:00 remaining"** with a live mono countdown. Tap → jumps queue to that duel. This is the one place vote urgency is loud.

---

## 3. COMPETE tab — tournament entry (existing surface, dueling-aware)

Opens with the **tournament deadline countdown** (the "what needs you" for competition). This tab already exists (M3 Compete slice). Wiring additions for dueling coherence:
- Reuse the **1080p export → `entry-videos` private bucket → `submit-entry` EF** pipeline.
- **Upsell seam:** if a duel prompted an upload ("upload this to the monthly tournament too"), deep-link from the duel result into Compete with the video pre-attached. Decisions §7.
- No new RPCs here; it consumes the existing tournament entry flow.

---

## 4. ACHIEVEMENTS tab — the badge vault

**Read — `badge_awards` ⋈ `badges`** for the caller (RLS: `competitor_id in competitor_ids()`).
```ts
type Badge = { code:string; name:string; tier:string|null; rarity:keyof typeof RARITY;
               tiered:boolean; awarded_at:string; seen:boolean;
               earn_rule?:{ trigger:string; rule:any } };  // 'how to earn' text
```
- Also read the **full `badges` catalog** (100 rows) to render locked/greyed slots with "how to unlock" — turns the vault into a goal map. Locked = desaturated Frame; earned = rarity glow.
- **Equip a frame:** the frame shown around your Arena video / avatar. Store `equipped_badge_code` on `competitors` (⚠ **column may not exist yet — add a migration** `alter table competitors add column if not exists equipped_badge_code text;` + an RPC `set_equipped_frame(p_code)` that checks the caller actually earned it). Flagged as the one backend gap this tab needs.
- **Frames-in-arena (Phase 3):** premium/season frames. Gate behind the Profile store later; render engine is the same `<Frame>`.
- Motion: new (`seen=false`) badges shimmer once on first view, then call a `mark badges seen` path (fold into reveal's seen-flip, or a small RPC). Tap a badge → detail sheet (art, rarity, when earned, "X competitors have this").

---

## 5. LEADERBOARD tab — comprehensive standings

**Read — `duel_ratings` ⋈ `competitors` (⋈ `schools`)**. Scopes as segmented control: **My School · My Rank+Age Bracket · Global**. Each row:
```ts
type Lb = { rank:number; competitor_id:string; name:string; school:string;
            frame:{code,rarity}|null; rating:number; wins:number; losses:number;
            streak:number; best_streak:number; you:boolean };
```
- Default scope = **My Rank+Age Bracket** (most motivating, matches matchmaking pool). Use `nmao.age_bracket_of(dob)` + `declared_rank` to filter.
- **Voter leaderboard** as a second view (`voter_stats`: votes_cast, accuracy, streak) — celebrates the community role (Kingmaker/Voice-of-the-People). Locked decision: voting is honored, not just competing.
- Highlight the caller's row (gold left-rail), and show a "you're #N, X to climb" sticky. `font-variant: tabular-nums` on all numbers.
- No writes. Realtime optional (subscribe to `duel_ratings` for live climbs) — nice-to-have, not required for v1.

---

## 6. PROFILE tab — the hub

Sectioned scroll (each section = a card that can later become its own screen):
1. **Header:** avatar in equipped Frame, name, school, rank + age bracket, current rating + streak.
2. **Membership & Store:** the **$3.99 Duelist** gate (Phase 2) + season-pass frames (Phase 3). Placeholder now; wire to Stripe later. Contextual upgrade also fires at challenge-time.
3. **My Dojo:** school/team — read `schools` for the caller's school; roster/standing link (mirrors School Portal data, read-only here).
4. **Journal:** post-reveal reflections. New table needed — `journal_entries(competitor_id, period|duel_id, body, created_at)` + RLS own-only. Prompted after a reveal. **Backend gap — add migration.**
5. **Rules & Help:** static, from `DUELING-DECISIONS.md` distilled to player-facing copy (monthly password, unedited-video, 15s watch, 4 duels/week, same rank+age, badges-at-reveal).
6. **Notifications:** guardian-controllable prefs → `notification_prefs` (per-type `enabled`). Read/write via RLS (`competitor_ids()`), toggle = upsert.
7. **Settings / sign-out:** secure-store session clear.

---

## 7. Alerts (header bell) + notifications

**Read — table `notifications`** (RLS: staff or `competitor_id in competitor_ids()`), newest first, `notifications_recipient_idx`.
```ts
type Notif = { id:string; type:string; title:string; body:string|null;
               data:{ duel_id?:string; period?:string; result?:string } | null;
               read:boolean; created_at:string };
```
- **Unread count** = `where read=false` (own `notifications_unread_idx`). Drives the bell badge.
- **Actions:** `mark_notification_read(id)` on tap, `mark_all_notifications_read()` on "clear all".
- **Types already emitted by triggers/cron:** `challenge_received, challenge_accepted, challenge_declined, duel_live, sudden_death, duel_result, reveal_ready, upload_reminder, voting_closing`. Map each to an icon + route (see §1 deep-link contract).
- **Realtime:** subscribe to `notifications` insert for the caller → live bell increment + optional in-app toast. This is the in-app layer; **Expo push delivery is a separate later layer** (register push tokens table + an EF that reads new notifications and sends via Expo). Flagged, not in v1.

---

## 8. The Reveals — TWO cadences (modals, not tabs)

**Locked model:** two distinct reveals. Anchor: `scratchpad/reveal-mockup.html` (both, playing). Both are **portrait, full-screen, stories-style** (progress segments up top, auto-advance + tap-to-advance, replay at end). Shared aesthetic = **mystical**: rotating dojo sigils, light-motes, dashed seal halo, ethereal glows; and an **uplifting score** — licensed ambient bed + a rising chime/particle burst + haptic on each bloom (mockup fakes the score with Web Audio pentatonic chimes; production uses a real licensed track, user-mutable, respects the silent switch).

### 8a. Dueling reveal — **after EVERY duel** (frequent)
Triggered when a duel resolves (`duel_result` notification / on opening a just-completed duel). This is the **tally unveiling** — the whole duel the tally was hidden, now it's revealed. Beats:
1. **The face-off — a UFC "Tale of the Tape"** (ref image; dojo-luxe, not fire). Each competitor's **profile photo (or silhouette fallback) slams in from their side on a spotlight of their equipped-badge color**, with the **badge crest as a faint watermark** behind them; fight-promo names (small first / big last); the **VS pops** with a flash + shake; then a **stat table** — Team · Style · Rank · Duel Wins · Win Streak · Rating (left value │ gold label │ right value, alternating rows). **No reveal button — Next advances.** Whoosh on each slam, gong on the VS.
2. **Result** — Win (crown + gold burst) / Deadlock (both glow) / **Loss (finalized, growth-framed):** shows *your* card (not the winner's) topped with a **jade growth emblem** (rising ↑, not a crown), headline **"Well fought."**, copy *"[Opponent] took this round — but every duel sharpens your edge."* No "you lost." A **warm, hopeful audio cue** (soft rising bells + flute — no gong/drum/brass). The loss tally stays honest but is framed by **"N competitors backed you."** Onward CTA: **"Improve your submission & compete again!"** + a **"Watch the winning form"** button (learn from the winner). Rewards still held to the monthly reveal.
3. **Tally revealed** — vote split bar + counts + "**N competitors backed you**".
4. **Onward — ALWAYS invite re-entry** (locked copy, outcome-aware):
   - **Win:** "Momentum. The arena felt that one." → CTA **"Enter again — keep your streak alive"**
   - **Deadlock:** "Too close to call." → CTA **"Run it back"**
   - **Loss:** "With every effort, we learn and grow. Your next form will be sharper." → CTA **"Improve your submission & compete again!"**
   - Plus a tease: "Your badges & medals are stacking up for the monthly reveal."
- **Rewards are NOT shown here** — no badges, no rating drop. Just the vote outcome + community + re-entry. (Withholding rewards to month-end is the loss-cushion.)
- **Data:** compose at view time from `duels` (result, winner) + `duel_votes` (tally, your backers). No new table strictly required, but see G3 — a lightweight `duel_reveal(duel_id)` RPC returning `{result, your_votes, their_votes, backers, opponent_name, message}` keeps the client thin and the tally logic server-side. **Recommended: build G3 as that RPC.**

### 8b. Badge & tournament-medal reveal — **ONCE A MONTH** (the ceremony)
Triggered by `reveal_ready` (auto-detect unseen `monthly_reveals` on launch). **Read — table `monthly_reveals`**, newest unseen:
```ts
type Reveal = { period:string; rating_at_reveal:number; seen:boolean;
  payload:{ signal:string; message:string;
    duels_won?:number; best_streak?:number; rating?:number; rating_gain?:number;
    votes_cast?:number; helped_decide?:number; backers?:number; schools_faced?:number;
    badges_earned?:number;
    badges?:{ code:string; tier:string|null; rarity:string; name:string }[];
    medals?:{ code:string; place:number|null; tier:'gold'|'silver'|'bronze'|'participation'; event:string }[] } };
```
- Beats: **shiny gold NMAO coin (the logo — asset-swappable; drop in the real high-res PNG/SVG) + message** → **tournament medals** → **badges** → **light season summary** (backers · rating ▲ · schools faced) → **close + "Reflect in your journal →"**. Navigation is **manual Next/Back** (competitors step through and linger); each collectible is **conjured from center** — spins outward along a random arc on a **magic-dust trail**, settles into its slot, then bursts. Score: gentle faerie martial-arts ensemble (flute/koto/glockenspiel/soft taiko), a rising sparkle per arrival.
- **Earned-action detail (required):** under each medal/badge, show **the concrete action that earned it** — e.g. "People's Champion — your duel vs. Kenji (Aug 12) won 78% of the vote." Not the rule, the *occurrence*. See gap **G8**.
- **Medal art (CGI, planned):** the medal component maps `tier → asset` and today draws a CSS metallic placeholder. When real medal renders arrive, swap the draw call for a transparent PNG/WebP (~3×) — or a **turntable sprite sequence** (24–36 frames) played during the emerge spin for true-3D shine. The lock-in layers (dust trail, shockwave, rays, shine sweep, particle burst, item-get sound) sit on top and are art-agnostic. Four assets needed: **gold / silver / bronze / participation ("insert")**. Badges can follow the same CGI path later. Keep CSS placeholders as fallback so the build isn't blocked.
- ⚠ **Backend gap G8 (new):** to render earn-actions, each `badge_award` needs its **earning context** (opponent name(s), vote %/margin, dates, streak members). Either add `badge_awards.context jsonb` populated by `award_dueling_badges()` at award time, or have the monthly-reveal payload compose it from `duels`/`duel_votes`. Payload gains `badges[].earned_action` (+ `medals[].earned_action`).
- **Positive-only** — rating shown up-only (▲gain), losses never surfaced. A quiet month still lands participation/voter badges here, so every reveal ends a win.
- On close: flip `seen=true` (also clears badges' `seen` shimmer, §4). Then prompt Journal (§6.4).
- ⚠ **Backend gap G7 (new):** `run_monthly_reveal` currently assembles `badges` but **not `medals`** — the monthly is now explicitly the *badge + medal* ceremony, so the payload must also gather tournament medals/placements for the period. Add `medals[]` to the payload assembly.

---

## 9. Backend gaps this app surfaces (add before/along the build)

| # | Gap | Fix |
|---|-----|-----|
| G1 | Equip-a-frame | `competitors.equipped_badge_code` column + `set_equipped_frame(code)` RPC (verify earned) |
| G2 | Journal | `journal_entries` table **EXISTS** — verify own-only RLS + add insert/list RPCs |
| G3 | ✅ DONE — Per-duel reveal (§8a) | `duel_faceoff(duel)` (both `nmao.competitor_card` cards + meta, no tally — pre-vote safe) + `duel_reveal(duel)` (adds tally/result/backers, hidden until close). Cards carry name/school/rank/rating/wins/streak/frame/`profile_photo_url`. Migration `20260816010000` |
| G9 | ✅ DONE — Profile photo | `competitors.profile_photo_url` + public `profile-photos` bucket; returned by `competitor_card`/`duel_faceoff`. Migration `20260816000000` (upload flow app-side) |
| G4 | Expo push delivery | `push_tokens` table + register RPC + EF that fans out new `notifications` |
| G5 | ✅ DONE — Queue frame data | `duel_vote_queue` returns `*_frame_code/_rarity/_name/_desc` + `p_search` (migrations `20260815000000`, `20260815010000`) |
| G6 | ✅ DONE — Mark-badges-seen | `mark_badges_seen(competitor?)` + `set_equipped_frame` (migration `20260815000000`) |
| G7 | ✅ DONE — Monthly medals (§8b) | `run_monthly_reveal` assembles `medals[]` from the `medals` table (`{tier,place,event}`) for the period. Migration `20260816020000` |
| G8 | ✅ DONE (column) — Earned-action detail (§8b) | `badge_awards.context` added + surfaced as `badges[].earned_action` (+`description`) in the monthly payload. Migrations `20260816000000`/`20260816020000`. Award fns populate `context` going forward |

G1/G5/G6 (Arena frames) — ✅ done. G2/G3/G4/G7 are later-phase; G3 + G7 gate the two reveals. Plus a player-facing copy pass on `badges.description` (spawned task).

---

## 10. Build sequence (recommended)

1. ✅ **Shell + tokens + primitives** — DONE. `packages/design-tokens` extended (`rarityStops`/`rarityBase`/`medalMetal`); `app/components/{Frame,Medal,Coin,Header}.tsx`; `app/App.tsx` 5-tab shell (opens on Duel; Compete + Profile=Home preserved); stub screens `app/screens/{Duel,Achievements,Leaderboard}.tsx`. See `app/DUELING-FOUNDATION.md`. NOTE: `npx expo install expo-screen-orientation` before the ring.
2. ✅ **Duel tab / Arena** — DONE (core loop). `app/lib/duel.ts` (all RPCs), `app/screens/Duel.tsx` (hub: week meter + Compete challenge/respond/upload + Vote queue+search) → `app/screens/Arena.tsx` (ring in a Modal: guarded landscape, framed forms, 15s watch-gate, cinematic vote via haptics+flash, hidden tally). `uploadDuelVideo`→`entry-videos` (confirmed). REMAINING: `npx expo install expo-video` (real playback → feed position to `setWatched`; poster seam in place) + `expo-screen-orientation` (rotate; guarded); Skia particle burst on vote; crest tooltip; sudden-death banner.
3. **Alerts + realtime notifications** — bell, list, mark-read, deep-link routing.
4. **Reveals** — (a) the per-duel dueling reveal (tally unveil + re-entry, needs G3) and (b) the monthly badge+medal ceremony (needs G7). Shared mystical/score/haptic engine.
5. **Achievements vault** — badge grid, equip frame, locked/goal states.
6. **Leaderboard** — scoped standings + voter board.
7. **Profile hub** — sections; wire prefs + dojo; store/journal as placeholders → then G2, Phase 2 store.
8. **Compete coherence** — duel→tournament upload seam.

Ship 1–4 as the playable core (challenge → vote → get notified → reveal). 5–8 complete the world.

---

*Constraint: this Mac has no working Node for this app (node_modules is Linux-built) — app code is authored here but RUN/verified on a machine with a working Expo toolchain. All backend RPCs referenced above are live in `oxzuavpyoetchwebdejp` and smoke-tested.*
