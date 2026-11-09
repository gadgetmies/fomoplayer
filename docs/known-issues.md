# Known issues

Problems that are understood but not yet fixed. Remove an entry when its fix merges.

## Spotify integration is hidden in Settings

**Symptom.** Settings never shows the Integrations tab, the Spotify link next to the follow search, or the
"Sync with Spotify" control on carts, for any user.

**Cause.** All three are guarded by `this.props.stores.includes('spotify')` in `packages/front/src/Settings.js`
(around lines 854, 997 and 1373). `stores` is the `/stores` response, an array of store objects
(`{ storeName, … }`), not names, so the check is always false. It has been like this since the start of the
repo's history.

**Why it is not a one-line fix.**
- Making the check true (e.g. `stores.some(({ storeName }) => storeName.toLowerCase() === 'spotify')`; confirm the
  exact `storeName` value) exposes three surfaces that have never been reachable: the Spotify authorization flow
  (`/auth/spotify`, read and write access), the followed-artists and playlists import, and cart sync. None of
  them has been exercised end to end, so each needs checking against a real Spotify account.
- It is a UI change, so it needs paired demo tests (see `CLAUDE.md`). A demo-preview test cannot authorize
  Spotify on the preview environment, so the preview recording needs a mocked authorization or must stop at the
  "Grant access" state.

**Already done.** The cart-sync API and the Settings state handling were fixed in `413c943fc`: enabling sync
returns the playlist details and Settings stores them, so the "Open Spotify playlist" link works once the
section is visible. The API tests are in `packages/back/test/tests/users/cart-spotify-sync.js`.
