# NMAO Competitor App — Screen Map (v1, definitive)

*The build map for the competitor/guardian app. Consolidates the product map
(`competitor-app.md`), the growth/effort pillar (`competitor-growth-and-badges.md`),
the brand (`brand-tokens.md`), and the 2026-08-08 scope decisions. Mobile-first,
metallic WKC/NMAO palette, effort-first. Five core tabs; several surfaces appear
contextually so the tab bar stays clean.*

Last updated: 2026-08-08

---

## Principle

Celebrate the effort as loudly as the win. Growth (vs your past self), the Imprint
(earned by showing up), the Code (earned virtues), and the Journal are the heroes;
medals are a shimmer on top. Every zero-state is an invitation, never a verdict.
Public social features are gated **off** for minors.

## Tab bar (5)

`Home · Imprint · Compete · Journey · Profile` — with **Reveal** (overlay),
**Badges**, **Journal**, **Leaderboards**, **Dueling**, and **Championship**
surfacing contextually (see §Secondary).

---

## 1. Home (Season) — the bento

The heartbeat screen. Mockup: `competitor_app_vertical_metallic_home` widget.

- **Elements:** header (avatar, school symbol, belt-color tier chip); hero card
  (season · round · deadline countdown · **Enter Round** CTA, mini-Imprint); rating
  (number + sparkline + division standing); effort **streak**; medals (G/S/B) +
  total events; **next reveal** entry ("results ready — tap to reveal"); Imprint
  teaser ("3 of 9 →").
- **Data:** `rounds`, `entries`, `results`, `skill_ratings` (realtime on round
  state), `medals`, streak from participation.
- **States:** pre-season ("opens [date]"), open, submitted, judging, results-ready.
  During a **Championship** event the hero becomes the bracket/advancement card.
- **Leaderboard ribbon:** a horizontally-scrolling stat strip at the top (rating,
  streaks, participation rate, school rank…) → opens full Leaderboards.

## 2. Imprint — full-page medallion (its own tab)

Mockup: `competitor_app…_imprint`.

- The 9-segment yin-yang; **every competed round fills a segment (100%)**;
  placement adds a gold/silver/bronze finish, participation earns the dignified
  base finish ("Tempered"). Tap a segment → that round's detail (score, placement,
  medal, **earned virtue**, replay reveal). Medal shelf, the season **Code**
  (virtues), season-keepsake unlock at completion. Digital twin of the physical
  collectible.
- **Data:** `results`, `medals`, `round_virtues`, `rating_history`.

## 3. Compete — enter + submit

- **Flow (enter and upload are decoupled):** pick event(s) → **Enter now** (pay the
  fee, Stripe) — a competitor can **sign up anytime and upload the video anytime
  before the deadline**; never blocked from entering for lack of a video. Then,
  before the 15th: on-screen **guidance** (framing, full-body, unedited, 30s–2min,
  clear area) → record/upload **up to 2 angles** (resumable). The **password is a
  single martial-arts word** issued per round (e.g. "Zanshin"), spoken on camera +
  shown on screen, so a clip can't be reused. Per-event **status**: entered → video
  added → judging → results.
- **Validation:** duration/format/angle-count checks; password issued per round
  (anti-reuse); name/date/category/password shown pre-form.
- **Championship mode:** shows your current **bracket stage** and the **next form
  due** (advanced/finale submit a second form for the medal round).
- **Data:** `entries` (write), Storage upload, `payments`, per-round password.
- **States:** deadline passed = read-only "closed"; upload progress; pay pending.

## 4. Journey / Growth — the growth home (hero of the effort story)

- **Growth Graph** — rating/score over the season with **personal-best markers**,
  and toggleable **per-criterion lines** (the Mirror: Technical, Power/Kime,
  Balance, Timing, Spirit, Difficulty) so you see *where* you grew. (Recharts;
  data from `rating_history`, `results`, `submission_scores`.)
- **Personal bests** (best placement, highest score, longest streak), the **Code**
  (virtues collected), **season goal** progress, and **round-by-round history** with
  replayable reveals.
- **Advancement / Championship tracker** — best-6-of-9 standing, progress toward
  semis/finale, and during finale/sponsor events the **bracket** (your stage, who
  advanced, next cut).
- **Reflections** — journal entries surface here (see Journal).

## 5. Profile — the shelf

- Photo framed by a **belt-color rank ring** (red/blue/purple = the tier spectrum),
  **school/team symbol**, and three metrics: **rating** (skill), **season points +
  standing** (placement-based, resets seasonally), and **total points earned**
  (lifetime — grows with **every event entered**; the effort accumulator that also
  drives the Mastery Path). Plus **medal shelf**, **Badges** entry (→ Badges page),
  personal bests, **physical-medal shipment tracking**, and settings + **guardian
  controls** (sharing off by default, data/video delete).
- **Data:** `competitors`, `skill_ratings`, `medals`, `medal_shipments`,
  `badge_awards`, guardian/consent.

---

## Secondary surfaces

### Reveal (overlay — its own moment)
Effort-first ceremony: segment lights + fills → **earned virtue** → for
non-placers a **motivational saying** (from the 500) → **growth** (rating movement,
new personal best) big → placement quiet → **reflection prompt** → optional
guardian-gated share. Closing: *"You rose. Keep training."* Reveal times **stagger**
by division (younger/beginner first). Data: `results`, `medals`, `rating_history`,
`round_virtues`, `motivational_sayings`.

### Badges (collection page)
Grid of earned + locked badges, many tiered; categories per
`competitor-growth-and-badges.md` §6. Entry from Profile.

### Journal
Private growth journal; rotating reflection prompt after each reveal; optional
**season goal**; feeds Consistent-Journaler badges. Guardian-visible for minors,
never public.

### Leaderboards
Competitor + **school** stats, effort-first ordering (streaks, participation rate,
most-improved beside medal counts), **geographic tiers — City · State · Country ·
World** (needs profile location). Two layouts: data-overlaid + blank template (per
`Leaderboard stats`).

### Dueling (when enabled by the school)
Async 1-v-1 video duels; challenge same-rank/category; both upload; side-by-side
duel page; **participant vote** (no public voting for now); badges/points; dueling
leaderboard. Admin-gated per student. Phase 2.

### Championship (Grand Finale + Sponsor tournaments)
The **tiered bracket** experience: Stage 1 → top 5 advance → regroup → top 3 → final
pod → champion. Shows your live stage, advancement, next form due, and a branded
(sponsor) frame where applicable. Phase 2.

### Onboarding & consent (COPPA gate)
Guardian sign-up + **video consent/waiver** (hard gate before competing), profile
setup, class/belt seeded from the Member Platform, and a video how-to. Blocks
Compete until consent is signed.

---

## Build order (competitor app)

1. Onboarding/consent → Home → Compete (submission + pay) → Reveal (effort-first) →
   Imprint → Journey/Growth → Profile. 2. Badges, Journal, Leaderboards.
3. Dueling, Championship bracket. Realtime on round state, judging %, and results
throughout.
