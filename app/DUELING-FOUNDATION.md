# Dueling app foundation (build-sequence step 1)

The visual + navigational foundation the dueling screens hang off. Follows the
existing app conventions exactly: inline styles, `@nmao/design-tokens`,
`expo-linear-gradient` for metal, emoji/text for glyphs (no SVG/vector-icons lib).

## What landed

**Shared tokens** (`packages/design-tokens/tokens.ts`, extended):
- `Rarity` + `rarityStops(r)` / `rarityBase(r)` — legendary→gold, epic→amethyst, rare→sapphire, common→steel
- `medalMetal` + `MedalType` — gold / silver / bronze / participation gradients

**Primitives** (`app/components/`):
- `Frame.tsx` — the collectible badge frame ringing a video/photo/avatar. `rarity` or `hue`; `size` `"mini"` (thumbs/avatars) vs `"ring"` (thick sponsor-ready band); rarity glow. THE reusable primitive across Arena, queue, face-off, avatars.
- `Medal.tsx` — tournament medal. **Asset-swappable**: pass `source` (real CGI render) → replaces the metallic placeholder.
- `Coin.tsx` — the NMAO gold coin (monthly-reveal opener). **Asset-swappable**: pass `source` with the real logo.
- `Header.tsx` — title + alerts bell (unread count). Alerts live here, not as a tab.

**Shell** (`app/App.tsx`): 5 bottom tabs — **Compete · Duel · Achieve · Ranks · Profile** — opens on Duel. Non-destructive: `Compete` = existing screen, `Profile` = existing `Home` (rating/tasks/reveal) for now. `Duel`/`Achievements`/`Leaderboard` are new foundation screens that demonstrate the primitives.

## The Arena (step 2) — BUILT

- `app/lib/duel.ts` — data layer over the live RPCs: `weekStatus`, `voteQueue` (frames+search), `findOpponents`, `createDuel`, `respondToDuel`, `submitDuelVideo`, `myActiveDuels`, `castVote`, `faceOff`, `playbackUrls`.
- `app/lib/upload.ts` — `uploadDuelVideo` → the `entry-videos` bucket (confirmed: `get-playback-url` duel branch signs `entry-videos`).
- `app/screens/Duel.tsx` — the real hub: weekly meter, **Compete** (Challenge → matchmaking → create; active-duel cards with Decline/Accept, Upload your form, ● LIVE) + **Vote queue** (search → cards). Tapping a queue card opens the ring in a full-screen `Modal`.
- `app/screens/Arena.tsx` — the **ring**: guarded landscape, two forms in `<Frame size="ring">`, watch-to-vote meter (15s), contrasting in-frame vote buttons, cinematic vote (`expo-haptics` + an Animated flash), hidden tally.

**Two installs light up the last 10%** (the app runs without them — poster + portrait fallback):
```bash
npx expo install expo-screen-orientation   # ring rotates to landscape
npx expo install expo-video                 # real playback in the ring
```
- **Orientation:** already guarded (`require("expo-screen-orientation")` in a try/catch; locks LANDSCAPE on mount, restores PORTRAIT_UP on unmount).
- **Video seam:** the ring currently shows a tappable poster; tapping drives the 15s watch-gate. Swap `<Poster/>` for a `VideoView`/`useVideoPlayer` and feed the real playback position into `setWatched` — the vote path (`castVote`, server-enforced ≥15s) is unchanged. Signed URLs already available via `playbackUrls(duelId)`.

## Notes
- Header + bell currently ride the 3 new tabs; unify onto Compete/Profile when those screens are rebuilt.
- `Home` will be re-homed into a proper Profile hub; its rating/tasks/reveal content stays intact meanwhile.
- Data is ready: `duel_faceoff` / `duel_reveal` / `duel_vote_queue` (frames+photos) / `duel_week_status` are live (see `docs/APP-WIRING-SPEC.md` §9 — G1/G3/G5/G6/G7/G8/G9 done).
- **Constraint:** author on any machine; run/verify on one with a working Expo toolchain (this Mac's `node_modules` is Linux-built).
