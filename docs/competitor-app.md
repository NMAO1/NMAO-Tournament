# NMAO Competitor App — Product Map & Experience Design

*Draft for planning. The competitor app is the flagship consumer experience — rich, ceremonial, and built to bring a young martial artist back every single month.*

Last updated: 2026-08-06

---

## 1. Who it's for

Competitors — mostly children (7+), plus adult competitors — with a **parent/guardian** attached to every minor's account. The tone is **premium and ceremonial** (black + gold, serif, the weight of a real martial-arts tradition) but also **warm and joyful** for kids. Safe by design: COPPA consent, private video, guardian controls.

## 2. North-star moment

**The Yin-Yang Imprint.** Every competitor has an on-screen yin-yang that begins as a faint outline and **fills in, segment by segment, as they earn each round's medal** — mirroring the physical collectible medal that interlocks into a full yin-yang over the season. The moment a round's result lands and their segment ignites with its medal finish is the emotional core of the app and the reason to return all nine months.

## 3. Information architecture

Bottom tab bar, four tabs, with the reveal surfacing over the top when results drop.

| Tab | Purpose |
|---|---|
| **Home (Season)** | The yin-yang hero, current round status + deadline countdown, and the entry point to the reveal. The heartbeat screen. |
| **Compete** | Enter events for the current round, record/upload the video, pay the entry fee, and track submission → judging status. |
| **Journey** | Per-round history (score, placement, medal, rating change), season standings (best 6 of 9), advancement tracker, and replayable reveals. |
| **Profile** | Avatar, rank, stats, medal shelf, badges/milestones, and settings (guardian-controlled). |

## 4. Screens & flows

**Onboarding & consent** — guardian and competitor sign up (magic-link auth, matching the rest of the suite); guardian completes the **COPPA video consent/waiver** (gating: a minor can't compete until it's signed); competitor profile setup (name, DOB, school, declared rank — auto-seeded from the Member Platform belt→tier mapping where available, profile photo).

**Home / Season** — the yin-yang centerpiece (season progress), a round-status card ("Round 4 — submit by the 15th" / "You're entered — judging in progress" / "Results ready"), a countdown to the deadline (the 15th) or to reveal day, current rating and standing at a glance, and quick entry to the Compete or Reveal flow.

**Compete / Submit** — pick the event(s) to enter (traditional forms, open forms, traditional weapons, open weapons); on-screen guidance (framing, length, rules, a good-vs-bad example); record in-app or upload; review; **pay the ~$45 entry fee** (Stripe); confirmation. Then a live status chip per event: submitted → judging → results.

**The Reveal** — see §6. The signature experience.

**Journey / Standings** — a scrollable season timeline of rounds with score, placement, medal, and rating delta; the **best-6-of-9** standing and where they sit in their division; an advancement tracker toward semis and the grand finale; and the ability to re-open (replay) any past reveal.

**Profile / Stats** — profile photo framed by a rank ring; the **rating gauge** (0–100); a **medal shelf** (gold / silver / bronze counts + participation segments); rounds competed, best placement, current streak; **badges/milestones**; rank and school; settings.

**Settings / Guardian** — notification preferences, sharing controls (off by default), account and data controls, and the guardian's ability to review or delete the child's data and videos.

## 5. The Yin-Yang Imprint — the mechanic

- The season's **9 qualifying rounds map to 9 segments** of the yin-yang. **Competing in a round fills that round's segment** — so every competitor who shows up completes the symbol over the season (inclusive by design; participation is honored).
- The **segment's finish encodes the medal**: a pearl/base finish for the participation segment everyone earns, with a **gold / silver / bronze** treatment layered on for a placement. Shinier segments = better rounds, but nobody's yin-yang stays empty just because they didn't place.
- The **semi-final and grand finale** complete the yin-yang's uniting elements — the flowing S-curve and the two "eyes" — so the championship stage literally finishes the balance. A fully completed yin-yang unlocks a **season keepsake** (a shareable, guardian-gated season artifact) that mirrors the assembled physical medal.
- It is the **digital twin of the physical collectible** — what arrives in the mail each round is reflected on the screen.

## 6. The Reveal — designing the moment

This is the part worth over-engineering. Principles and ideas:

**Anticipation.** Results drop on a set **reveal day** (after the 7-day judging window). Between submission and reveal, the round's segment sits **locked and faintly glowing** with a countdown — the app builds excitement rather than dumping a number.

**The ceremony.** On reveal day the competitor gets a notification and opens a full-screen moment: a breath of stillness, then **they tap to reveal**. Light sweeps across the yin-yang, the earned segment **etches and fills** with its medal finish (a "pour" of gold/silver/bronze or the pearl of participation), a soft **gong/chime** sounds, and a **haptic pulse** lands with the fill. Then the numbers arrive — score, placement, and the **rating movement** (the gauge animates +/−).

**Meaning, not just a score.** Each fill can carry a **martial-arts virtue** (discipline, focus, perseverance, respect, balance…), so over the season the competitor collects both medals *and* a code to live by — a small, age-appropriate piece of the art itself. The framing centers **growth**: "You rose. Keep training." Everyone gets a dignified moment — showing up and earning your segment is honored, which matters most for the youngest and the not-yet-placing kids.

**Placement flourish.** A gold/silver/bronze finish adds extra celebration — particles, a shimmer, a rank stamp — without making the non-placing reveal feel lesser.

**Share (safely).** At the end, an optional **shareable card** (their yin-yang progress + medal). For minors this is **off by default and guardian-gated**, and only ever shares the artifact — never the raw video.

**Wellbeing guardrails.** The standings already forgive missed months (best 6 of 9), so the app **never shames a missed round**. Streaks and milestones are framed as encouragement, not pressure. No dark-pattern urgency aimed at children.

## 7. Stats, progress & motivation

Rating gauge (0–100), medal shelf, division standing (best 6 of 9), advancement tracker, streak of rounds competed, and **badges/milestones** (first submission, first medal, first gold, "completed the yin-yang," advanced to semis). Motivation is intrinsic and collectible — the yin-yang is the pull.

## 8. Tech & data

- **React Native + Expo**, with **Reanimated / Skia** powering the yin-yang and the reveal animation (this is where the polish budget goes).
- **Video:** record/upload to **Vimeo** (private/unlisted); resumable uploads; clear rules/guidance.
- **Payments:** **Stripe** for the entry fee.
- **Backend:** **Supabase** — the competitor/guardian reads their own data through the RLS policies already in place; entries, results, ratings, medals come straight from the engine tables.
- **Notifications:** Expo push for deadline reminders (the 15th), "results ready," and new-round-open — all guardian-controllable.

## 9. Safety & COPPA (built in, not bolted on)

Guardian linkage on every minor account; a hard **consent gate** before a child can compete; **private video** with no public discovery; **sharing off by default and guardian-gated**; minimal data collection; and guardian review/delete controls. See `legal/privacy.html` and `legal/video-consent-waiver.html`.

## 10. Open questions to decide

- **Yin-yang segmentation:** confirm 9 segments = 9 qualifying rounds, with semis/finale completing the S-curve + eyes. (Or a different split?)
- **Participation vs. placement finish:** confirm everyone fills their segment (pearl) and placements add gold/silver/bronze shine.
- **Virtues:** do we want the "collect a virtue each round" layer, and if so, which virtues?
- **In-app recording vs. upload-only** for video (in-app camera is more work but a smoother, safer flow).
- **Who submits/pays for a minor** — the guardian, the competitor within limits, or either?
- **Sharing:** allow guardian-gated sharing of the season keepsake at all, or keep everything fully private for v1?
