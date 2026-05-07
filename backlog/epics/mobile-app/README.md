# Mobile app — feature parity with the web app, redesigned for mobile

## Goal

Ship native iOS and Android Fomo Player apps that cover everything the web
app does today, but reshaped for an idiomatic touch experience: bottom
tabs, swipe gestures, sheets and action menus, lock-screen / Control
Center / Android-notification audio controls, native push notifications,
deep-linkable shareable cart URLs, and offline tolerance.

## Why

- The web app is the primary surface and works on mobile browsers, but
  it is not idiomatic on a phone: the top bar, dropdowns, popups, and
  keyboard-shortcut affordances were designed for desktop. Daily-driver
  mobile use needs first-class native ergonomics.
- Real native audio controls (lock screen / Control Center / Android
  notification + headset / car remotes) and reliable background
  playback are not feasible inside a mobile browser. A native app
  unblocks them.
- Native push notifications give a much higher signal than email/web
  push for "new tracks matching your follows / saved searches", which
  is the core value proposition.
- Discoverability — being installable from the App Store and Play Store
  is a meaningful funnel for new users.

## Scope

### In scope (parity with the web app, redesigned)

- Auth: Google OAuth, session, logout, sign-up flow, waiting list,
  email verification.
- Browse: New / Recent / Heard track lists, sort + filter controls,
  infinite scroll, search.
- Player: multi-store preview playback (with the existing Bandcamp
  full-track behaviour preserved per `CLAUDE.md`), queue, prev/next,
  seek, store-source preference, mark-heard-on-play.
- Carts: list, detail, add/remove, default cart, shareable cart URLs
  (deep-linkable), public read-only cart view, mark-purchased,
  import-playlist.
- Follows & ignores: follow artists / labels / playlists per store,
  star to elevate scoring, ignore artists / labels / releases, follow
  popup from a track row, Spotify integration auth.
- Settings: every page from the web app — following, sorting (score
  weights), carts, notifications (incl. audio-sample notifications),
  ignores, collection, integrations.
- Notifications: subscribe / unsubscribe per saved search, **delivered
  as native push** rather than (or in addition to) email.
- Onboarding: a first-run tour adapted for touch gestures, replacing
  the desktop keyboard-shortcuts tour.

### Mobile-idiomatic redesigns (not a literal port)

- Bottom tab bar (Tracks · Search · Carts · Settings) replaces the top
  navigation menu.
- Persistent mini-player above the tab bar; tap to expand into a
  full-screen Now Playing.
- Native bottom sheets and action menus replace popups (Follow popup,
  Ignore popup, sort/filter dropdowns, keyboard-shortcuts help).
- Per-row swipe gestures for the most-common actions (add to default
  cart, mark heard); long-press → full action menu.
- Native share sheet for cart URLs.
- Lock-screen / Control Center / Android-notification controls via
  `MediaSession` / `MPNowPlayingInfoCenter`.
- Offline-tolerant mutation queue (heard, add-to-cart, follow, ignore)
  that replays on reconnect.

### Out of scope for the MVP

- The Admin views (`/admin` route) — admin tooling stays web-only.
- The desktop keyboard-shortcuts surface (replaced by gestures /
  action sheets on mobile).
- Reworking the browser extension or its surfaces.
- Changes to ingestion / backend track-feed pipelines beyond what the
  mobile push-notification story explicitly needs.

## Stories

This epic is composed of 12 stories. They aim to be deliverable
independently in roughly the listed order — earlier stories unblock
later ones (bootstrap → API client → auth → everything else).

1. [039 — Mobile project bootstrap & app shell](../../stories/039-mobile-bootstrap-app-shell)
2. [040 — Shared API client & data layer](../../stories/040-mobile-shared-api-client)
3. [041 — Authentication & session](../../stories/041-mobile-auth-session)
4. [042 — Track lists & row actions](../../stories/042-mobile-track-lists-and-row-actions)
5. [043 — Audio playback & Now Playing](../../stories/043-mobile-audio-and-now-playing)
6. [044 — Search](../../stories/044-mobile-search)
7. [045 — Carts (incl. shared/public cart)](../../stories/045-mobile-carts)
8. [046 — Follows & ignores](../../stories/046-mobile-follows-and-ignores)
9. [047 — Settings (all pages)](../../stories/047-mobile-settings)
10. [048 — Push notifications](../../stories/048-mobile-push-notifications)
11. [049 — Onboarding & sign-up](../../stories/049-mobile-onboarding-and-signup)
12. [050 — Cross-cutting: offline, accessibility, telemetry, distribution](../../stories/050-mobile-cross-cutting)

The symlinks in this folder mirror the same list and resolve regardless
of whether each story is in `todo/`, `in-progress/`, or `done/`.

## Notes

- **Framework recommendation: React Native + Expo.** The web app is
  React; the same engineers can move; React Query covers most of the
  data-layer story; Expo's audio (`expo-av` / `react-native-track-player`),
  auth (`expo-auth-session`), notifications, secure store, and EAS
  Build/Submit cover the platform integrations the epic needs without
  per-platform native code. This decision lives in story 039 and is the
  right place to revisit if it doesn't hold.
- **No deployment domains in source code** — per the project's
  configuration policy, the mobile app reads its API URL from a
  build-time env var (`EXPO_PUBLIC_API_URL`) rather than hardcoding any
  host.
- **Bandcamp full-track behaviour** — per `CLAUDE.md`, Bandcamp
  "previews" are full streaming MP3s. The mobile player must not apply
  preview-window skip logic on Bandcamp tracks, and must mark a track
  heard at the moment audio starts playing (not after a duration
  threshold). Story 043 calls this out explicitly.
- **Mobile auth handoff** — the existing OIDC handoff infrastructure
  (`pr-preview-auth-handoff` capability) is the natural surface to
  reuse; story 041 adds a mobile-specific consume endpoint mirroring
  the extension flow.
