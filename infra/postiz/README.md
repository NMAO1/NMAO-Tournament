# Postiz self-host — NMAO social posting

Self-hosted, open-source social scheduler that replaces Ayrshare as the *publisher*
for the NMAO social system. Mission Control (`mc.nmao.us/social.html`) stays the
approval UI; the `social-publish` edge function calls Postiz's public API to post.

**Cost:** the software is free. You only pay for the small VPS (~$5/mo) it runs on.

---

## 1. Provision a VPS
Any small Linux box with Docker. Cheapest good options:
- **Hetzner** CX22 (~$5/mo) or **DigitalOcean** basic droplet (~$6/mo).
- Ubuntu 22.04/24.04. Install Docker + Compose:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

## 2. DNS
Point a subdomain at the VPS public IP:
- `postiz.nmao.us`  →  A record → `<VPS_IP>`
(Wherever nmao.us DNS is managed.)

## 3. Configure + launch
On the VPS, copy this folder up (or `git clone` the repo and `cd infra/postiz`), then:
```bash
cp .env.example .env
# edit .env: set POSTIZ_HOST / POSTIZ_MAIN_URL to your subdomain,
# and generate secrets:
#   openssl rand -hex 32   -> POSTIZ_JWT_SECRET
#   openssl rand -hex 16   -> POSTIZ_DB_PASSWORD
docker compose up -d
docker compose logs -f postiz     # wait for it to come up
```
Caddy fetches a Let's Encrypt cert automatically, so `https://postiz.nmao.us` just works.

## 4. Create the owner login, then lock signups
- Open `https://postiz.nmao.us`, register the first (owner) account.
- Set `POSTIZ_DISABLE_REGISTRATION=true` in `.env`, then `docker compose up -d` again so nobody else can register.

## 5. Create the platform developer apps (the slow part — do the ones you need)
For each network, create a developer app, then add its keys to `.env` and re-up.
Use this **redirect/callback URL**: `https://postiz.nmao.us/api/integrations/social/<provider>`
(Postiz shows the exact callback per provider on its connect screen — copy it from there.)
- **Instagram + Facebook** → Meta app. IG must be a Business/Creator account linked to a FB Page. Keys: `FACEBOOK_ID`, `FACEBOOK_SECRET`.
- **YouTube** → Google Cloud project + YouTube Data API. Keys: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
- **TikTok** → TikTok developer app + Content Posting API (needs approval). Keys: `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`.

> Tip: start with **Instagram only** to avoid running three app-review processes at once. Add the rest later.

## 6. Connect NMAO's accounts
In the Postiz UI, connect each social account (OAuth). Each becomes an "integration."

## 7. Wire it to NMAO's publisher
Get the integration ids and a public API key, then set two Supabase secrets on the
Tournament project (`oxzuavpyoetchwebdejp`):
```bash
# List your connected channels + their ids:
curl -s https://postiz.nmao.us/public/v1/integrations -H "Authorization: <POSTIZ_API_KEY>"

# Set the secrets the social-publish function reads:
supabase secrets set POSTIZ_URL=https://postiz.nmao.us --project-ref oxzuavpyoetchwebdejp
supabase secrets set POSTIZ_API_KEY=<your key> --project-ref oxzuavpyoetchwebdejp
# Map our platform labels to the integration ids from the list above:
supabase secrets set POSTIZ_INTEGRATIONS='{"instagram":"<id>","youtube":"<id>","tiktok":"<id>"}' --project-ref oxzuavpyoetchwebdejp
```
(The API key comes from Postiz → Settings → Public API.)

## 8. Test one post
From `mc.nmao.us/social.html`, approve a post with a video, then "Send to platform".
⚠ Postiz's exact post/media payload can vary by version — do ONE test post to a
throwaway account first and adjust `social-publish` if the shape differs (the
function is written to be easy to tweak; see its header comment).

---

### How publishing flows
`mc.nmao.us/social.html` (approve) → `social-publish` EF → `POST {POSTIZ_URL}/api/public/v1/upload`
(media) → `POST {POSTIZ_URL}/api/public/v1/posts` (per mapped integration) → Postiz posts to
Instagram/TikTok/YouTube. Until `POSTIZ_URL` + `POSTIZ_API_KEY` are set, `social-publish`
returns `not_configured` and changes nothing.

## Version note — pinned to v2.11.3 (pre-Temporal)
Postiz **v2.12.0+ requires a separate Temporal service** (Java, heavy) that does not fit a
2 GB VPS. The compose is therefore pinned to **`v2.11.3`** — the last Redis-queue-based
release, which runs comfortably here. To move to `:latest` later, add a Temporal service
and size up to ≥4 GB RAM. If you ever change the pin, reset the empty DB volume
(`docker volume rm postiz_postiz-pg`) before first boot so migrations match the version.

## Updated to current Postiz (v2.24) on a 4GB box — Temporal + Elasticsearch
The v2.11.3 pin could not do Meta's *current* Instagram API (Meta retired the old
`instagram_basic`/`instagram_content_publish` scopes). Current Postiz (v2.12+) needs
**Temporal**, and Temporal needs **Elasticsearch** for advanced visibility (Postiz
registers >3 Text search attributes; Postgres-only visibility caps at 3 and the backend
crashes with "cannot have more than 3 search attributes of type Text"). So the box was
rescaled to **CPX22 (4GB)** and the stack is: postiz v2.24.0 + postiz-postgres + redis +
temporal (auto-setup 1.28.1) + temporal-postgresql + temporal-elasticsearch (256MB heap)
+ caddy. `dynamicconfig/development-sql.yaml` is mounted into Temporal. Verified live:
backend healthy, memory ~2.7GB used of 4GB.

## VERIFIED LIVE 2026-09-28 — Bluesky end-to-end
Pipeline proven: `social-publish` payload → Postiz → a real post on @nationalmartialart.
Key facts learned (self-hosted differs from the cloud docs):
- Public API base is **`/api/public/v1/...`** (NOT `/public/v1/...` — that hits the frontend and 307s to /auth).
- Auth = **raw** API key in `Authorization` (Bearer returns "Invalid API key"). Key lives in `Organization.apiKey` in the DB.
- `POST /api/public/v1/posts` **requires a `date`** (ISO 8601) even for `type:"now"`.
- Secrets set on Tournament project: `POSTIZ_URL=https://postiz.nmao.us`, `POSTIZ_API_KEY`, `POSTIZ_INTEGRATIONS={"bluesky":"<id>"}`.
- social-publish updated: correct path, always-send date, and text platforms (bluesky/mastodon/etc.) no longer require a video.
