## Why

The Bandcamp feed (`https://bandcamp.com/<user>/feed`) is one of the
primary discovery surfaces for users following labels and artists, but
the extension currently injects no row-level controls there. Users have
to click through to a release or track page before they can audition,
queue, or add to a cart — a friction Fomo Player explicitly removes
elsewhere on Bandcamp.

## What Changes

- Inject Play, Queue, and "Add to Fomo Player" buttons on each playable
  feed entry (entries that link to `/album/...` or `/track/...`) on
  `https://bandcamp.com/<user>/feed`.
- Each button reuses the existing `cueButton` / `renderCartButton`
  factories so the visual treatment, loading lifecycle, and idempotent
  re-injection guard match the release-page and discography-grid
  injections.
- Releases / tracks linked from feed entries are loaded on demand via
  the existing `fetchReleaseTralbum` worker fetch — no new permissions
  or message types are required.
- Skip non-playable feed entries (community posts, "now following"
  notifications, anything without a release or track link).

## Capabilities

### New Capabilities
<!-- none — extending bandcamp-track-actions -->

### Modified Capabilities
- `bandcamp-track-actions`: extend the per-track injection requirement
  to cover Bandcamp feed entries in addition to release pages, track
  pages, and discography grids. Each playable feed entry exposes one
  Play, one Queue, and one Add-to-Fomo-Player control with the same
  behaviours as the equivalent discography-tile controls.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js`:
  - Add `onFeedPage()` page detector and `injectFeedButtons()` injector
    that walks feed entries, picks the entry's `/album/...` or
    `/track/...` link, lazy-fetches the release via `fetchReleaseTralbum`,
    and mounts a Play / Queue / Add button trio on each entry.
  - Hook the new injector into the existing `reinjectSoon`
    MutationObserver loop so virtualised / infinite-scroll feed loads
    pick up the buttons.
- No service-worker, audio-player, or message-protocol changes
  required: `bandcamp:enqueue`, `bandcamp:add-to-cart`, and
  `bandcamp:fetch-html` already cover the runtime path.
- Out of scope: cover-overlay restyling (item 016), data-fp-injected
  alignment (items 004 / 018), and "Add to Fomo Player" cart-membership
  display (item 009) — those land separately.
- No new permissions, dependencies, or build steps.
