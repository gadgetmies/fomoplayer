---
id: 020
title: Bandcamp logged-in detection is unreliable; sync controls always disabled
status: todo
priority: P1
effort: M
created: 2026-05-05
depends-on: []
---

# Bandcamp logged-in detection is unreliable; sync controls always disabled

## Why

The popup's Bandcamp panel exposes "Sync wishlist to Fomo Player cart" and
similar Bandcamp sync actions, but they are gated by a `loggedIn` flag that
appears to be wrong: the controls stay disabled even when the user is
plainly logged in to Bandcamp in the active tab. As a result, no Bandcamp
sync is reachable from the popup, defeating the feature's whole purpose.

The current probe (`packages/browser-extension/src/js/content/bandcamp.js:55`)
uses `document.querySelector('.userpic')` as the login signal. On modern
Bandcamp pages this element is either missing entirely or only present on
specific pages (the user's own profile / fan dashboard), so the probe
returns `false` on most pages where the popup is opened. We need a
detection that works across the pages a user is realistically on
(release page, artist page, discover, fan dashboard, etc.).

## What

- Compare the captured logged-in vs logged-out HTML of a Bandcamp page
  and identify a stable, page-agnostic DOM/JS signal that reliably
  distinguishes the two states. Candidates to evaluate (verify against
  the captures, don't assume): the presence of `pagedata` `identities.fan`
  in the embedded JSON blob, a `name="user-nav"` / fan menu link, a
  cookie like `client_id` / `identity` / `js_logged_in`, or a profile
  link containing the user's slug.
- Replace `probeLoggedIn` in `packages/browser-extension/src/js/content/bandcamp.js`
  with the chosen signal. If a single DOM check isn't reliable, fall
  back to checking multiple signals and treating any positive match as
  logged-in.
- Make sure the popup re-probes on open so the sync buttons reflect the
  current tab's actual state (not a cached stale value).
- Confirm the popup's `Sync (Requires login)` row enables the sync
  buttons whenever the new probe reports `loggedIn = true` on a real
  Bandcamp tab, and continues to disable them on a real logged-out tab.

## Acceptance criteria

- [ ] On a freshly logged-in Bandcamp tab (any of: release page, artist
      page, fan dashboard, discover), opening the extension popup
      enables the wishlist-sync and current-page sync buttons.
- [ ] On a logged-out Bandcamp tab, the same buttons stay disabled and
      the "Requires login" message is shown.
- [ ] Reloading the popup after logging in (without reloading the
      Bandcamp tab) reflects the new state — i.e. detection is not
      cached past a single popup open.
- [ ] No extra permissions are added; the detection runs in the
      existing content-script context that already has access to the
      tab's DOM.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp.js:55` —
  `probeLoggedIn = () => Boolean(document.querySelector('.userpic'))`.
  This is the broken signal; replace with whatever the captured HTML
  comparison shows is reliable.
- `packages/browser-extension/src/js/content/bandcamp.js:79-83` —
  `bandcamp:probe` message handler returning `{ loggedIn, hasPlayables,
  onSubdomain }`. Keep the response shape; only the source of `loggedIn`
  changes.
- `packages/browser-extension/src/js/popup/BandcampPanel.jsx:37` —
  initial state `{ loggedIn: false, ... }`.
- `packages/browser-extension/src/js/popup/BandcampPanel.jsx:40-49` —
  `componentDidMount` issues the probe; the response sets `loggedIn`.
  This is also where to confirm we re-probe per popup open (default
  React mount behaviour already does, but verify).
- `packages/browser-extension/src/js/popup/BandcampPanel.jsx:130-148` —
  the sync block whose `disabled` props read `!loggedIn`.

## Captured HTML

The user said the logged-in / logged-out captures are in the project's
`temp/` folder, but at item-filing time `temp/` was empty. Two files
named `logged-in.html` / `logged-out.html` exist at
`packages/browser-extension/` but their content is Beatport markup, not
Bandcamp — almost certainly captures for a different feature. Before
implementing this item:

- [ ] Re-capture (or locate) the actual Bandcamp logged-in and
      logged-out HTML, store both in this item's directory (e.g.
      `bandcamp-logged-in.html`, `bandcamp-logged-out.html`), and diff
      them to pick the detection signal.

## Out of scope

- Beatport / other-store login detection — file separate items if
  similar bugs exist there.
- Adding a "log in to Bandcamp" CTA inside the popup. The popup already
  shows a "Requires login" hint; expanding that is a UX item, not part
  of this fix.
- Any new sync actions or changes to the wishlist-sync flow itself —
  this item only fixes the gating.

## Open questions

- Is there a single reliable signal across all Bandcamp page types, or
  do we need a small set of fallbacks? (Answer comes from comparing
  captured HTML once it's available.)
- Should the probe also check a cookie via `chrome.cookies` if DOM
  signals are flaky? Probably no — that would require a new permission;
  prefer DOM/JS signals first.
