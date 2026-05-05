## Why

The popup's Bandcamp panel gates "Sync wishlist" and "Feed" sync controls
behind a `loggedIn` flag derived from `document.querySelector('.userpic')`
in the content-script probe. On modern Bandcamp pages the `.userpic`
element is missing on every surface other than the user's own profile,
so the probe returns `false` even when the user is plainly logged in,
leaving the popup's sync features unreachable from any release, artist,
discover, fan-dashboard, or homepage tab.

Bandcamp's hydrated menubar exposes a `Log in` link
(`a[href*="/login?from=menubar"]`) only while no fan is signed in. The
link's absence is the most reliable cross-page signal — it tracks the
menubar's actual session state, is present on every bandcamp.com surface
(including the homepage, where the server-rendered `#pagedata` blob's
`identities` object is empty even for signed-in fans), and survives
artist subdomains.

Switching to that signal also lets us drop the misleading "(Requires
login)" heading once the user is logged in.

## What Changes

- Replace the `probeLoggedIn` implementation in
  `packages/browser-extension/src/js/content/bandcamp.js` with a single
  selector check: the user is logged in iff the document contains no
  `a[href*="/login?from=menubar"]`.
- Drop the `.userpic` DOM check entirely; it is no longer used as either
  a primary or fallback signal.
- Do not consult the `#pagedata` `data-blob` `identities` object — it is
  unreliable on cached / homepage responses and the menubar signal
  supersedes it.
- Keep the `bandcamp:probe` message contract unchanged: the handler
  still returns `{ loggedIn, hasPlayables, onSubdomain }`.
- In `packages/browser-extension/src/js/popup/BandcampPanel.jsx`, hide
  the "(Requires login)" parenthetical from the Sync section heading
  whenever `loggedIn` is true. The heading reads "Sync" when logged in
  and "Sync (Requires login)" when logged out.

## Capabilities

### New Capabilities

- `bandcamp-login-detection`: How the extension determines whether a
  Bandcamp tab is logged in for the purpose of gating sync controls in
  the popup.

### Modified Capabilities

_(none)_

## Impact

- Affected code:
  - `packages/browser-extension/src/js/content/bandcamp.js` (`probeLoggedIn`)
  - `packages/browser-extension/src/js/popup/BandcampPanel.jsx` (Sync
    heading copy)
- No new permissions; the probe runs in the existing content-script
  context that already reads the page DOM.
- No backend or worker changes.
- Risk: Bandcamp could rename the menubar `Log in` link or change the
  query string. If that happens the probe would flip every user to
  "logged in" until the selector is updated. Mitigation: the heading,
  buttons, and resulting sync calls would still fail loudly when used,
  matching the visibility level of the previous bug.
