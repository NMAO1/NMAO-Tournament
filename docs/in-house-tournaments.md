# NMAO — In-House Tournaments (school-run)

*A feature of the **Tournament School Portal**: a school hosts its own tournament
for its own students — **free to host, self-judged, school-defined prizes**. NMAO
provides the flow and the engine; the school runs the event. A huge engagement
driver between the monthly NMAO rounds.*

Last updated: 2026-08-08

---

## 1. What it is (and isn't)

- **Self-contained & local.** An in-house tournament lives entirely inside one
  school. It does **not** charge entry fees, does **not** touch a competitor's
  global NMAO **rating / points / medals**, and does **not** use the NMAO judge
  pool. It's the school's event, start to finish.
- **We provide the flow.** The same proven engine (divisioning → pods → judging →
  placements) runs the event; the school just presses the buttons.
- **The instructor is in control:** they set it up, assign their own judges (or
  judge it themselves), and hand out whatever prizes they like.
- **Results are the school's:** posted **school-only** by default, or optionally
  published to the school's public NMAO page.

## 2. The flow

1. **Create** — name, date, description; pick **event categories**; choose
   **divisions** (age × class × event — reuse the Division Scheme, or a simple
   school-set bracket for small events); set **prizes** (free-form: trophies, a new
   belt, gift cards, bragging rights); choose **judging mode** (video submission or
   **live/manual** score entry); set **visibility** (school-only / public).
2. **Enter** — invite students from the roster (or open it to the whole school);
   **free**. For a video event, students upload (reuse the Compete flow, no fee);
   for a **live** event, no upload — the instructor scores on the day.
3. **Divide** — auto-sort entrants into divisions/pods with the divisioning engine
   (or arrange manually for a small field).
4. **Judge** — the school's **own judges** score each competitor. Reuse the judging
   UI (per-criterion, or a simple 1–10 the school can opt into). Assign judges
   manually (the instructor + helpers). Live mode = enter scores directly.
5. **Resolve** — the engine turns scores into placements per division (reuse the
   resolve core; **skip** the global rating update).
6. **Prizes & results** — the instructor sees the standings, marks prizes awarded,
   and generates a shareable **results page / announcement**.
7. **Publish** — school-only or to the public NMAO page.

## 3. Engine reuse

The pure cores do the work, unchanged: `divisioning.ts` (classify → collapse →
form pods), `rating.ts` `resolvePod` (placements + tiebreaks). What's **omitted**
for in-house: entry-fee payments, `updateRatings` (no global rating), NMAO medal
shipment. What's **added**: manual judge assignment and school-defined prizes. So
this is mostly a new persistence + UI layer around the same tested engine.

## 4. Data model (school-scoped, self-contained)

- `school_tournaments (id, school_id, name, description, event_categories jsonb,
  scheme jsonb, judging_mode ['video'|'live'], visibility ['school'|'public'],
  status ['draft'|'open'|'closed'|'judging'|'complete'], starts_at, created_at)`
- `sh_tournament_entries (id, tournament_id, competitor_id, event, division_key,
  pod_key, video_url?, score, placement, status)`
- `sh_tournament_judges (tournament_id, staff_id | name)` — the school's judges.
- `sh_tournament_prizes (tournament_id, division_key, placement, prize_text,
  awarded bool)`
- **RLS:** everything scoped to the school; only that school's admins/judges see or
  edit it. No cross-school visibility unless published public.

## 5. Recognition (optional, local)

A school may grant a **local participation record** or hand out physical prizes, but
in-house results never alter global NMAO rating/points/medals or the season Imprint.
(Optionally, a school could later "sanction" an event to count — a Phase-3 idea,
off by default.)

## 6. Phase & open questions

- **Phase 2** (after the monthly tournament + portal Phase 1 ship).
- Open: should in-house events optionally support **live/in-person** brackets with
  on-the-spot scoring only (no video)? *(Yes — the `judging_mode: 'live'` path.)*
- Open: allow a school to **clone** the official Division Scheme vs. build a custom
  simple bracket? *(Offer both.)*
- Open: can students from **multiple schools** be invited to a "friendly" (crosses
  the self-contained boundary)? *(Default no; a Phase-3 "invitational" mode.)*
