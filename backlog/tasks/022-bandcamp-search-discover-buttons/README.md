---
id: 022
title: Inject Play / Queue / Add-to-Fomo on Bandcamp search and discover surfaces
effort: M
created: 2026-05-05
---

# Inject Play / Queue / Add-to-Fomo on Bandcamp search and discover surfaces

## Why

The extension already injects the Play / Queue / Add-to-Fomo button trio
on Bandcamp release pages (title section + per-track rows), the
discography grid (`#music-grid` tile overlays), and the feed
(`bandcamp.com/<user>/feed`). The big remaining gap is the discovery
flow: when a user lands on `bandcamp.com/discover/<tag>` or runs a
search, every track / album / artist / label result is a place where
they'd want to queue or play immediately, but the trio is absent and
they have to click through to the release page to interact with Fomo
Player.

This item covers four surfaces:

- `https://bandcamp.com/discover/<tag>` (and the `/discover` root) —
  the curated tag-feed grid.
- `https://bandcamp.com/search?q=<q>&item_type=t` — track results.
- `https://bandcamp.com/search?q=<q>&item_type=a` — artist results.
- `https://bandcamp.com/search?q=<q>&item_type=b` — catalog (label)
  results.

For results that point at a release (track or album), the trio MUST do
the same thing it already does on a discography tile — Play and Queue
fetch the linked release via `fetchReleaseTralbum` and dispatch the
existing worker messages; Add-to-Fomo opens the cart dropdown. For
artist and label results — which point at an artist or label home page,
not a single release — we need a deliberate decision: the trio either
appends every release the artist / label exposes (potentially huge), or
the buttons render disabled with an explanatory tooltip, or the trio is
suppressed entirely and only the cart / "follow" affordance is shown.
Pick during scoping; default suggestion below.

## What

- Add new injection passes in
  `packages/browser-extension/src/js/content/bandcamp/inject.js` that
  cover the four surfaces above. Each pass MUST:
  - Detect its own surface (URL match + DOM marker so the same
    rebuild handles both directly-loaded and SPA-navigated entries).
  - Find the per-result mount node on each card and skip nodes that
    already carry `[data-fp-injected]`.
  - Determine the result's primary `/album/...` or `/track/...` link.
  - Render the standard `cueButton({ label: 'Play' })`,
    `cueButton({ label: 'Queue' })`, `renderCartButton({ label: 'Add
    to Fomo' })` cluster wrapped in `buttonContainer()`, with
    `iconOnly` if the card is a compact tile (mirror the
    `#new-releases-vm` decision in `injectFeedButtons`).
  - Wire Play to `bandcamp:enqueue` `{ playNow: true }`, Queue to
    `bandcamp:enqueue`, and the cart toggle to `getReleases` returning
    the `fetchReleaseTralbum` for the linked release.
- Hook each new pass into the existing `reinjectSoon` debounce so the
  MutationObserver covers infinite scroll / "load more" /
  filter-change re-renders. Run the pass once on initial mount and
  then on every observer tick.
- Treat artist (`item_type=a`) and label (`item_type=b`) results
  separately:
  - **Default proposal**: render only the Add-to-Fomo cart toggle on
    artist / label cards (no Play / Queue), so the user can drop the
    artist's discography into a cart without trying to enqueue an
    unbounded number of releases. Confirm with the user before
    implementation.
  - **Alternative**: omit the trio entirely and link out to the
    discography page where the existing per-tile injection already
    handles the rest. Cheaper but leaves the discovery flow unchanged
    on artist / label results.
- Update the `bandcamp-track-actions` capability spec to extend the
  "feed-page entries expose Play, Queue, and Add-to-Fomo" requirement
  to cover the discover and search-track surfaces, plus add a new
  requirement for the artist / label cards' chosen behaviour.

## Acceptance criteria

- [ ] On `bandcamp.com/discover/<tag>`, every release tile shows the
      Play / Queue / Add-to-Fomo trio. Play streams the first track
      without leaving the page; Queue appends without playing;
      Add-to-Fomo opens the cart dropdown.
- [ ] On `bandcamp.com/search?q=<q>&item_type=t`, every track result
      shows the trio. Play / Queue act on that single track; the cart
      dropdown opens for it.
- [ ] On `bandcamp.com/search?q=<q>&item_type=a` (artist), each
      artist card renders the agreed treatment (Add-to-Fomo only by
      default, or trio with discography-bulk-enqueue if the user
      prefers).
- [ ] On `bandcamp.com/search?q=<q>&item_type=b` (catalog / label),
      each label card renders the same treatment as artist results.
- [ ] No duplicate injections: rapid scrolling / filter changes /
      Bandcamp re-renders leave each card with exactly one trio (or
      one cart toggle, on artist / label cards).
- [ ] Visual treatment matches the existing cover-overlay style
      (transparent fill, brand border, brand-fill hover, dark backdrop
      wrap) — the trio reads as part of the same family as the
      discography-tile and feed injections.
- [ ] No regression to the release page, per-track, discography, or
      feed injections.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/inject.js:33-38`
  — surface detectors. Add `onDiscoverPage()`,
  `onSearchPage()` (with item-type sub-detectors).
- `packages/browser-extension/src/js/content/bandcamp/inject.js:300-362`
  — `injectFeedButtons` is the closest analogue: it already finds a
  per-card link, picks `iconOnly` based on the parent surface, and
  wires the trio. The discover and search passes will mirror this
  shape; only the mount-node selectors differ.
- `packages/browser-extension/src/js/content/bandcamp/inject.js:366-394`
  — `reinjectSoon` / MutationObserver. Hook the new passes there.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js`
  — `renderCartButton` already accepts a `getReleases` async function;
  pass `() => fetchReleaseTralbum(href).then(r => r ? [r] : [])` (or
  the artist-discography variant for `item_type=a`).
- `openspec/specs/bandcamp-track-actions/spec.md` — has the existing
  feed-entries / per-tile / per-row requirements; the new surfaces
  belong here as `ADDED Requirements` or as a `MODIFIED` extension to
  the existing feed-entry rule.

## Out of scope

- The Bandcamp album-list view inside a cart (e.g. inside Fomo Player
  itself) — that's the in-app surface and out of scope here.
- Refactoring the existing injection passes. New passes only.
- Making the search results infinitely scroll virtualised entries
  inject without a polling fallback — the existing MutationObserver
  already covers this for the feed; we'll re-use that path.
- Server-side (worker) changes. The new buttons reuse
  `bandcamp:enqueue` / `bandcamp:get-carts` exactly as they are.
- Adding new permissions; the existing `https://*.bandcamp.com/*`
  match in `manifest.base.json:24` already covers all four surfaces.

## Open questions

- What should happen on artist / label result cards? Default proposal
  above is "cart toggle only". User to confirm before implementation.
- Are there separate DOM templates for the discover grid (the
  recently-revamped `discover/<tag>` page) vs. the search results? If
  so, two passes; if not, one shared selector. Confirm during
  implementation by reading both surfaces' DOM.
- Does `bandcamp.com/discover` (the root, no tag) render the same
  card template as `discover/<tag>`? If yes, free coverage; if not,
  file separately.
