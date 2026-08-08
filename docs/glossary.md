# NMAO Build — Plain-Language Glossary

*A running reference of the technical terms we use as we build, each explained
simply and tied to this project. We add to it as new terms come up.*

Last updated: 2026-08-07

---

## The tools we work in

**CLI (Command Line Interface)** — controlling a program by typing commands
instead of clicking. Example: `supabase functions deploy round-controller`.

**Terminal / shell / bash** — the text window where you type CLI commands. "Bash"
is the most common shell (the language the terminal understands). Same idea as
Finder/Explorer, but keyboard-driven.

**Supabase** — the service hosting our backend: the database, user login, file
storage, and edge functions, all in one. Our project lives there.

**Postgres (PostgreSQL)** — the actual database engine inside Supabase. It stores
every table (competitors, entries, pods, results…) and answers questions written
in SQL.

**Dashboard** — the point-and-click website for Supabase, as opposed to the CLI.
The **SQL Editor** and **Edge Functions** pages live there.

## Talking to the database

**SQL (Structured Query Language)** — the language for asking a database to store
or fetch data. Example: `select count(*) from entries where status='valid';`
means "how many valid entries are there?"

**Schema** — the *shape* of the database: what tables exist and what columns each
has. Our schema is defined in the `migrations` folder.

**Migration** — one file of SQL that builds or changes the schema, numbered so
they run in order. Example: `20260805120000_tournament_engine.sql` creates the
rounds/entries/pods tables.

**Seed / seed data** — sample data loaded into an empty database so we have
something to work with. `seed_demo.sql` creates a fake tournament round.

**Seed output** — the text the seed script prints when it runs (e.g. the new
`round_id`), so you know it worked and can grab values you need.

**Row / record** — one entry in a table (one competitor, one pod). **Column /
field** — one piece of info on that row (a competitor's name, rank).

**UUID** — a long, random, guaranteed-unique ID like `a3f8c1e2-9b0d-4f...`. We use
them so two rounds (or competitors) can never share an ID.

## The engine pieces

**Edge function** — a small program running on Supabase's servers that does work
when called. Ours is `round-controller`, which runs the tournament pipeline.

**Deploy** — to publish your latest code so the live server runs it. If you change
the function's code, you redeploy so the change takes effect.

**Invoke / call** — to *run* a deployed function. `supabase functions invoke
round-controller ...`

**Endpoint / URL** — the web address a function answers at. Calling it is sending
a **request**; what it sends back is the **response**.

**POST** — the type of web request that *sends data to* a server (as opposed to
GET, which just *asks for* data). We POST each pipeline step.

**Request body** — the data attached to a request. Ours is JSON telling the
function which round and step to run.

**Pipeline / step** — the tournament runs in ordered stages (steps):
`divide → assign_judges → resolve → distribute`. Each is one job.

**Idempotent** — safe to run more than once: running a finished step again does
nothing instead of doubling up. Protects us from accidental double-clicks/retries.

## Data formats & code

**JSON (JavaScript Object Notation)** — a simple text format for structured data,
written as `"key": value` pairs in `{ }`. Example:
`{"roundId":"a3f8...","step":"divide"}`.

**Variable** — a named placeholder for a value. In the terminal, `RID=a3f8...`
lets you write `$RID` instead of the long ID afterward.

**Flag / option** — an extra setting on a command, usually starting with `--`.
Example: `--body "..."` attaches data to the request.

**TypeScript / TS** — the programming language the engine is written in (a stricter
version of JavaScript). Files end in `.ts`.

**Key / token / auth** — a secret string that proves who's allowed to do
something. Supabase has two generations of keys, and both appear on the dashboard:
- **Legacy keys (JWTs, start `eyJ…`)** — the older `anon` (public) and
  `service_role` (secret) keys, on the *Legacy* API-keys tab.
- **New keys** — `sb_publishable_…` (public) and `sb_secret_…` (secret), on the
  *Publishable and secret API keys* tab. Our project has these enabled.
- **Which one the tournament function wants:** the **`sb_secret_…`** secret key.
  Because the new system is on, the function's built-in `SUPABASE_SERVICE_ROLE_KEY`
  is that new secret key — *not* the legacy `service_role` JWT. Sending the legacy
  or anon key gives `Invalid or expired session`. Any secret key bypasses security,
  so it lives only in your terminal/server settings — never in chat or the app.
- **Fingerprint trick:** to check a key matches what the server holds without
  revealing it, compare SHA-256 hashes — `printf '%s' "$KEY" | shasum -a 256`
  against the digest in `supabase secrets list`.

## Version control (Git / GitHub)

**Git** — a system that tracks every change to the code so you can see history and
undo mistakes.

**Repo (repository)** — the project folder Git is tracking (`NMAO-Tournament`).

**Commit** — a saved snapshot of changes with a short note describing them.

**Push** — upload your commits to GitHub so they're backed up and shareable.

**GitHub** — the website that hosts the repo online.
