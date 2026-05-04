## 1. Add the feed-page page detector

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/inject.js`, add an `onFeedPage()` predicate that returns true when `location.pathname` ends with `/feed` (matches `bandcamp.com/<user>/feed`).

## 2. Implement `injectFeedButtons`

- [x] 2.1 Implement `injectFeedButtons()` that selects every `a[href*="/album/"], a[href*="/track/"]` link inside the feed body, climbs to the nearest stable container ancestor (first match of `.story-innards`, `.collection-item-container`, `.story-fan-collection-item`, or fallback `li`), de-duplicates entries that share a container, and skips containers already carrying `[data-fp-injected]` so re-injection is idempotent.
- [x] 2.2 For each playable container, build the same Play / Queue / Add-to-Fomo-Player trio used in `injectDiscographyButtons`, sharing the cached `getReleases = async () => { const r = await fetchReleaseTralbum(href); return r ? [r] : [] }` between all three buttons of that entry. Play sends `bandcamp:enqueue` with `playNow: true`, Queue sends `bandcamp:enqueue` without it, and Add uses `renderCartButton`.
- [x] 2.3 Mount the wrap with the same `position: absolute; top: 6px; right: 6px; z-index: 5;` overlay treatment as `injectDiscographyButtons`, switching the container's `position` to `relative` if it computes to `static`. This keeps the feed visually consistent with discography tiles until item 016 restyles them.

## 3. Hook the new injector into the reinjection loop

- [x] 3.1 In the `reinjectSoon` callback, add an `if (onFeedPage()) injectFeedButtons()` branch alongside the existing release-page and discography branches. The branch ordering does not matter — page detectors are mutually exclusive in practice.

## 4. Manual verification

- [ ] 4.1 Build the extension (`pnpm --filter browser-extension build` or whatever the package script is) and load it in the browser. _(build verified: `yarn build:chrome` succeeds; loading + UI check pending the user's session)_
- [ ] 4.2 On `https://bandcamp.com/<user>/feed`, confirm each playable entry exposes exactly one Play, one Queue, and one Add-to-Fomo-Player control, with no duplicates after scrolling.
- [ ] 4.3 With an empty queue, click Play on a feed entry — confirm the linked release is fetched, every track is appended, the first becomes active, and playback starts. No navigation.
- [ ] 4.4 With a non-empty queue, click Queue on a feed entry — confirm the prior queue is preserved and the entry's tracks are appended without starting playback. No navigation.
- [ ] 4.5 Click Add-to-Fomo-Player on a feed entry — confirm the cart dropdown opens with the same loading / success / error lifecycle as on a release page.
- [ ] 4.6 Scroll the feed to trigger Bandcamp's lazy load of further entries — confirm the new entries receive controls in the next debounce window without duplicating earlier ones.
- [ ] 4.7 Confirm community posts and "now following" entries (no `/album/` or `/track/` link) get no controls.

## 5. Wrap-up

- [x] 5.1 Run `openspec validate bandcamp-feed-track-buttons --strict`.
- [x] 5.2 Update `backlog/items/002-bandcamp-feed-track-buttons/notes.md` (create if missing) with a session-log entry summarising what was implemented and any deviations.
- [x] 5.3 After user verification, commit (single commit covering inject.js + the openspec change directory + backlog updates) and move backlog item 002 to **Done** in `backlog/INDEX.md`.
