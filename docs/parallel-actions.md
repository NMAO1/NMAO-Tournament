# Bradley — Parallel Action Checklist

*Things only you can do that unblock the build. Ordered by leverage + external lead time.*

Last updated: 2026-08-06

## Unblocks the live round (highest value)
- [ ] Create Supabase projects (NMAO account, **US East**): `nmao-tournament-staging` + `nmao-tournament-prod`.
- [ ] From **staging → Project Settings → API**, send me the **Project URL** + **anon** key + **service_role** key (share the service_role key securely — it bypasses RLS).

## Accounts to set up (each has verification lead time)
- [ ] **Vimeo** — NMAO account, Pro/Business tier (private videos + upload API). Gates the video pipeline.
- [ ] **Stripe** — NMAO account + enable **Stripe Connect** (automated per-round school payouts). Have incorporation details ready.
- [ ] **D-U-N-S** — Aug 24 meeting (booked); then start Apple Developer (Organization) + Google Play Console (Organization).

## Content to send me (feeds the build)
- [ ] Existing **member-platform privacy policy** (I'll adapt it + draft the COPPA/video waiver — indefinite storage, promotional-only). *(Found `privacy.html`/`terms.html` in the member repo — I can pull from those if you'd like.)*
- [ ] **Belt orders** for the styles your schools teach (TKD, Karate, Tang Soo Do, …) for the belt→tier mapping defaults. *(The member schema already has `belt_systems`/`belt_levels` — we can seed from there.)*
- [ ] **Brand kit** — logo files + confirm the look. *(Pulled the member-platform tokens: black `#080808` + gold `#C9A84C`, serif display **Libre Baskerville** / body **Cormorant Garamond** / UI **Lato**. Confirm this carries to the apps.)*
- [ ] Confirm the **rubric** (6 criteria + Traditional/Open weights) is what judges should score, or send changes.

## Decisions to mull (not blocking)
- [ ] Judge pay (~$1.50/video working) + how judges get paid.
- [ ] Notification channels (email / push / SMS).
- [ ] Semis/finale **prize-pool structure** (funded by the 8% set-aside).
- [ ] **Viewer-app** scope (leaderboards, highlights, later the sponsor-vote).
