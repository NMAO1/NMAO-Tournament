# NMAO Tournament — Morning Refresher

*Written the evening of 2026-08-07 so you can pick this up cold tomorrow.*

---

## The big picture

We're testing the **tournament engine** end to end for the first time — feeding it
a fake round of competitors and watching it do the whole job automatically:
sort everyone into fair groups, assign judges, turn judge scores into placements
and rating changes, and produce the medal shipping list. "Running a round" means
walking that data through the engine's steps, in order, and checking the results
look right.

The engine lives on **Supabase** (our backend). We trigger each step by calling a
small program there called **`round-controller`**.

## What we built today

- **The missing step.** The engine could sort competitors in theory, but nothing
  wrote those groups to the database. I added the **`divide`** step — it creates
  the divisions and pods and seats every competitor. This was the last piece
  needed to run a full round.
- **A demo round to test with** — `seed_demo.sql` creates 26 fake competitors, 4
  schools, and 8 judges, arranged to exercise every tricky case (a normal group, a
  3-judge advanced group, a too-small group that has to merge, and a separate
  event).
- **Proof it works** — an automated test builds a real database in memory, runs
  the engine on the demo data, and confirms it produces exactly the right groups
  (4 divisions, 4 pods) and that re-running a step safely does nothing. All green.
- **A security fix (from the Claude Code side).** The `round-controller` now has a
  **gate**: only an internal/service caller or a signed-in NMAO staff member can
  run it. Without that, anyone could trigger payouts. We deploy it via the
  Supabase command line, not a copy-paste bundle.
- **Your learning aids** — `docs/glossary.md` / `glossary.pdf` (plain-language
  definitions) and `docs/run-a-round.md` (the full runbook).

## Where we are right now

- ✅ **Database is ready.** We ran `verify_schema.sql` against the live project and
  all 11 checks came back `true`.
- ✅ **The round is seeded.** Its ID is
  **`587dee84-5843-4ecb-a08c-dac5472c386b`** — `state = closed`, 26 valid entries.
- ✅ **The function is deployed and gated** (we know because it's returning the
  gate's own error message).
- ⏸️ **Paused on one thing: the key.** When we called the function, it replied
  `"Invalid or expired session."` That means the key we sent wasn't recognized as
  the service-role key. The most likely reason: Supabase now defaults to a
  **new-style secret key** (`sb_secret_…`), but the function checks against the
  **legacy JWT** service-role key (starts with `eyJ…`). We need to use the legacy
  one.

## Tomorrow — the ordered steps

Everything below is done in the **Terminal**, except the one dashboard SQL step.
Nothing is destructive; re-running a step that already finished just does nothing.

### 1. Open Terminal and go to the project

```
cd ~/Documents/GitHub/NMAO-Tournament
```

### 2. Set the function address + the RIGHT key

Get the **legacy** service_role key: dashboard → **Project Settings → API →
Legacy API keys → `service_role` → Reveal/Copy** (it starts with `eyJ…`). Then:

```
FN=https://oxzuavpyoetchwebdejp.functions.supabase.co/round-controller
KEY='PASTE_THE_LEGACY_service_role_KEY_HERE'
```

Sanity check (safe — shows only the first 10 characters):

```
echo ${KEY:0:10}
```

You want it to read `eyJhbGciOi`. If it reads `sb_secret_`, that's the wrong
(new-style) key — go back and copy the **Legacy** service_role one.

### 3. Run the first two steps — *why:* build the groups, then attach judges

```
curl -sS -X POST "$FN" -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"roundId":"587dee84-5843-4ecb-a08c-dac5472c386b","step":"divide"}'
```

Expect roughly `{"ok":true, ... "divisions":4, "pods":4, "assigned":26}`.

```
curl -sS -X POST "$FN" -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"roundId":"587dee84-5843-4ecb-a08c-dac5472c386b","step":"assign_judges"}'
```

Expect about 64 judge assignments.

### 4. Add judge scores — *why:* stand in for judges scoring in the app

In the dashboard **SQL Editor**, run **`seed_demo_scores.sql`**. Expect it to
report `64`. (This fills in scores so the next step has something to resolve.)

### 5. Run the last two steps — *why:* placements + medals

```
curl -sS -X POST "$FN" -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"roundId":"587dee84-5843-4ecb-a08c-dac5472c386b","step":"resolve"}'
```

```
curl -sS -X POST "$FN" -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{"roundId":"587dee84-5843-4ecb-a08c-dac5472c386b","step":"distribute"}'
```

### 6. Look at the results

The verification queries are in `docs/run-a-round.md` (section 3) — they show the
divisions/pods, the placements and rating changes, and the medal shipments. Paste
any step's output to me and I'll confirm the numbers with you.

## Small reminders

- **Keys stay on your machine.** Never paste the service-role key into our chat —
  just the harmless first few characters if we're debugging.
- **Push when convenient.** Today's commits are saved locally; give them a push
  from GitHub Desktop so they're backed up.
- **If a step errors,** copy the red/error text to me — each one has a specific,
  fixable cause. We're genuinely one key away from seeing the first full round.

*Order of operations tomorrow: fix the key → `divide` → `assign_judges` →
`seed_demo_scores.sql` → `resolve` → `distribute` → look at results.*
