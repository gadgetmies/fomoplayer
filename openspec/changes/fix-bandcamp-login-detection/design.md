## Context

The Bandcamp content script returns a `loggedIn` boolean to the popup
so the popup can gate sync controls. The current probe checks for a
single DOM node — `.userpic` — that ships only on a small subset of
Bandcamp pages (the user's own profile / fan dashboard). On any other
surface (release, artist, discover, fan dashboard's main view,
homepage) the probe returns `false` and the sync controls stay
disabled even when the tab is logged in.

A first attempt switched the probe to read the server-rendered
`#pagedata` `data-blob` JSON's `identities.fan` field, but on the
bandcamp.com homepage that blob's `identities` object is empty even
for signed-in fans (likely cached at the edge before per-fan
identification), so the wishlist button still stayed disabled there.

Bandcamp's hydrated menubar reflects the live session state: when
logged out it renders a `Log in` link
(`a[href*="/login?from=menubar"]`); when logged in it doesn't. The
menubar is rendered on every bandcamp.com page that the popup is
realistically opened on, so its login link is the most reliable
cross-page signal.

## Goals / Non-Goals

**Goals:**

- Reliable login detection across every Bandcamp surface a user
  realistically opens the popup from (homepage, release, artist
  subdomain, fan dashboard, discover, feed).
- No new permissions, no extra fetches, no cookie reads.
- Keep the `bandcamp:probe` message contract unchanged.
- Keep the popup's Sync heading honest — drop the "(Requires login)"
  parenthetical when the user is logged in.

**Non-Goals:**

- Reworking the popup's gating UX or adding a "log in to Bandcamp" CTA
  inside the popup. Tracked separately if needed.
- Detecting login for any other store. Beatport / others can file
  their own items.
- Caching the probe result across popup opens — the React mount
  already re-issues the probe on every popup open.
- Changing the `bandcamp-feed` button's `onSubdomain` gate. That gate
  exists because the feed-sync flow calls `bandcamp.com/api/...` and
  `bandcamp.com/fan_dash_feed_updates`; running those from an artist
  subdomain page is cross-origin and out of scope here. The visible
  symptom of "feed disabled on the homepage" was a downstream effect
  of the broken `loggedIn` probe and resolves with this change.

## Decisions

### Decision: Use the absence of `a[href*="/login?from=menubar"]` as the login signal

**Rationale:** Bandcamp's hydrated menubar tracks the live session
state and is present on every bandcamp.com surface where the popup is
opened. The login link is rendered only when the user is logged out,
so its absence is a positive logged-in signal. Comparing the captured
markup with the runtime DOM (the user supplied the exact selector
`<a class="g-button no-outline" href="https://bandcamp.com/login?from=menubar" role="menuitem">Log in</a>`),
this selector is stable enough to rely on as the sole source of truth.

**Alternatives considered:**

- **`document.querySelector('.userpic')`** (status quo) — misses every
  page that doesn't render the fan badge. Rejected.
- **`#pagedata` `data-blob`'s `identities.fan` / `identities.user`** —
  works on most pages but fails on the bandcamp.com homepage where
  the cached blob's `identities` is empty even for signed-in fans.
  Rejected.
- **`chrome.cookies` (e.g. `client_id`, `identity`)** — would require
  a new permission and break Firefox MV3 parity. Rejected.
- **Menubar IDs (`#menubar-collection-icon` etc.)** — present in
  both states (the menubar template is shared). Rejected.
- **`window.TralbumData.fan_tralbum_data`** — only present on release
  / track pages. Rejected.

### Decision: Drop the `.userpic` and `#pagedata` fallbacks

**Rationale:** Both are strictly less reliable than the menubar
signal. Keeping them would only paper over a future Bandcamp markup
change that broke the menubar selector — and in that case we want
the user to see the bug (sync controls disabled) rather than have
fallbacks silently flip-flop the gating. Single source of truth is
easier to reason about and to update.

### Decision: Keep the probe synchronous within the existing handler

**Rationale:** No async work is needed. The probe runs once per popup
open against the live DOM and the message-shape contract is
preserved.

### Decision: Make the popup's "(Requires login)" heading conditional

**Rationale:** Showing "(Requires login)" while the buttons are
enabled is contradictory and was reported as confusing. The cheapest
fix is to drop the parenthetical when `loggedIn` is true.

## Risks / Trade-offs

- **Bandcamp renames the menubar `Log in` link or its query string.**
  → The probe would flip every user to "logged in"; sync calls would
  then fail loudly when used. Same visibility as today's bug; we
  notice in QA. We deliberately don't keep silent fallbacks.
- **The menubar isn't yet hydrated when the popup runs the probe.** →
  In practice the popup's content-script probe runs after the page
  has loaded and Vue has hydrated. If the timing ever fails on a slow
  page, the user can re-open the popup and the React re-mount will
  re-issue the probe.
- **A page outside the menubar's coverage is opened (e.g. an
  embedded player iframe).** → Out of scope; the popup is opened
  against the active tab's top-level document.

## Migration Plan

Single-step replacement; no data migration. Roll out with the next
extension build. Rollback = revert the file.

## Open Questions

_(none — the user supplied the menubar selector; the captures
confirmed the previously-considered signals were unreliable.)_
