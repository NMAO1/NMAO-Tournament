# Running a full round (demo)

End-to-end steps to take a round from raw entries through medals, using the
`round-controller` edge function and the demo seed. Everything is idempotent —
re-running a step is a no-op once it's `done`.

## 0. Prerequisites

- Schema applied on the project: run `supabase/reset_and_apply.sql` once in the
  SQL Editor (fresh project) — it now includes all six migrations, including
  `claim_step()`.
- `round-controller` deployed with secrets `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` set (Project → Edge Functions → Secrets).

### Deploy the function

**CLI only** — the Supabase CLI bundles the `../_shared` imports for you:

```bash
supabase functions deploy round-controller --project-ref oxzuavpyoetchwebdejp
```

Do **not** deploy a hand-flattened single-file bundle: it drops the `authorize()`
gate (re-opening the pipeline to anyone who can POST) and the dashboard can't
resolve `../_shared` anyway. The split files + CLI are the only supported path.

The function is **gated** (`authorize()` in `index.ts`): a caller must present
either the **service-role key** (internal/cron) or a signed-in **NMAO staff**
session (`nmao.is_staff()`). Anyone else gets 401/403.

## 1. Seed a round

Run `supabase/seed_demo.sql`. It prints a `round_id` (also returned by the final
`select`). Copy it — you'll POST it to the function.

## 2. Run the pipeline

Because the function is gated, invoke it with the project's **secret key** as the
bearer (it stays on your machine — never paste it anywhere shared). Set:

```bash
FN=https://oxzuavpyoetchwebdejp.functions.supabase.co/round-controller
KEY='sb_secret_...'                 # the new-style secret key; do not echo/commit it
```

> **Which key? (this bit the first time.)** This project has Supabase's **new API
> key system** enabled, so the function's built-in `SUPABASE_SERVICE_ROLE_KEY` is
> actually the **new `sb_secret_…` secret key** (dashboard → API → *Publishable and
> secret API keys* → `secret` → Reveal), **not** the legacy `service_role` JWT on
> the *Legacy* tab. Passing the legacy key (or the anon key) returns
> `{"error":"Invalid or expired session."}`.
>
> Confirm you have the right one without exposing it: `supabase secrets list
> --project-ref oxzuavpyoetchwebdejp` shows a SHA-256 digest for
> `SUPABASE_SERVICE_ROLE_KEY`; `printf '%s' "$KEY" | shasum -a 256` must match it.
> (`supabase functions invoke` sends the anon key, which the gate rejects — use the
> curl form below.)

```bash
post () { curl -sS -X POST "$FN" -H "Authorization: Bearer $KEY" \
  -H "content-type: application/json" -d "{\"roundId\":\"$RID\",\"step\":\"$1\"}"; echo; }

RID=<round_id from step 1>

post divide          # classify -> collapse -> form pods  (writes divisions/pods, seats entries)
post assign_judges   # 1 judge for beg/int pods, 3 for advanced; never own-school
# --- judges would now score in the app. For the demo, stand that in: ---
#     run supabase/seed_demo_scores.sql in the SQL Editor
post resolve         # scores -> placements, updates skill_ratings + rating_history
post distribute      # builds ship list, writes medals + medal_shipments
```

`divide` expects a round in `closed` state with valid entries (the seed creates
exactly that). After `divide` the round is `podded`; after `distribute`,
`distributed`.

> Shortcut: `post all` runs `divide` then the tail in one call — but `resolve`
> can only score pods whose judge scores are in, so for a real judged round use
> the step-by-step sequence above (score between `assign_judges` and `resolve`).

## 3. Verify

```sql
-- divisions & pods (expect 4 and 4 for the demo seed)
select event, age_key, rank_key, is_collapsed, entry_count from divisions where round_id = '<RID>' order by event, age_key, rank_key;
select d.event, d.rank_key, p.seq, p.size, p.judge_count, p.state
  from pods p join divisions d on d.id = p.division_id where d.round_id = '<RID>';

-- results & ratings
select r.placement, r.score, r.rating_delta, r.rating_after
  from results r join entries e on e.id = r.entry_id where e.round_id = '<RID>' order by r.pod_id, r.placement;
select * from skill_ratings order by updated_at desc limit 10;

-- recognition
select medal_type, count(*) from medals where round_id = '<RID>' group by medal_type;
select school_id, item_count, ship_status from medal_shipments where round_id = '<RID>';
```

The demo seed exercises the whole divisioner: a normal 1-judge beginner pod, a
3-judge advanced pod, a thin 13–15 division that collapses on rank into a single
7-entry (3-judge) pod, and a separate `open_forms` event that never merges.
