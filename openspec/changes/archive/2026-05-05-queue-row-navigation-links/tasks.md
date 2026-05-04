## 1. Extend the queue item shape with the new URLs

- [x] 1.1 In `packages/browser-extension/src/js/service_worker.js`, inside `buildQueueItemsFromReleases`, derive `releaseOrigin = release.url ? new URL(release.url, 'https://bandcamp.com').origin : ''`. Use it as the artist URL anchor.
- [x] 1.2 For each track, compute `trackUrl` by joining `releaseOrigin` with `track.title_link` when present (e.g. `/track/foo-bar`). Fall back to `release.url` when the track exposes no per-track link.
- [x] 1.3 Compute `artistUrl = releaseOrigin || ''`. Include it on every queue item when the origin is known.
- [x] 1.4 Compute `labelUrl` best-effort from `release.current?.label_url || release.label_url || null`. When it equals `artistUrl`, set it to `null` so the UI knows to omit the link.
- [x] 1.5 Add `trackUrl`, `artistUrl`, and `labelUrl` to the queue item object alongside the existing `releaseUrl`.

## 2. Render the link row in the queue UI

- [x] 2.1 In `packages/browser-extension/src/js/content/bandcamp/player-ui.js`, extend the shadow `STYLE` block with a `.qrow .qlinks` rule (small, muted text, gap between links): `font-size: 11px; color: #888; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px;` and a `.qrow .qlinks a` rule (`color: #b8b8b8; text-decoration: none;` with `:hover { text-decoration: underline; color: #f1f1f1; }`).
- [x] 2.2 In `rebuildQueue`, build a `linksHtml` string per row. Include only the links whose URL is present, escape the href via `escapeHtml`, and use the labels Track / Release / Artist / Label. _(Implemented as `buildQueueLinks(q)` plus a `buildLinkHtml(url, label)` helper so the per-row template stays readable.)_
- [x] 2.3 In the row click handler, add a `if (e.target.closest('a')) return` guard alongside the existing `[data-remove]` guard, so clicking a link does not dispatch `audio:play-at`.

## 3. Manual verification

- [ ] 3.1 Build (`yarn build:chrome`) and reload the extension. _(build verified; live reload pending the user)_
- [ ] 3.2 Open the queue panel with a few queued Bandcamp tracks. Confirm each row shows Track, Release, and Artist links under the artist line.
- [ ] 3.3 Plain-click each link — confirm the current tab navigates to that page and the embedded player keeps playing without skipping.
- [ ] 3.4 Cmd/Ctrl-click and middle-click each link — confirm a new tab opens and the embedded player keeps playing without skipping.
- [ ] 3.5 Click the row outside any link/remove area — confirm playback switches to that track.
- [ ] 3.6 Click the remove (X) button — confirm the row is removed.
- [ ] 3.7 Find a release with a label distinct from the artist — confirm the Label link appears. On a release without a label URL (or whose label URL matches the artist URL), confirm no Label link is rendered.

## 4. Wrap-up

- [x] 4.1 Run `openspec validate queue-row-navigation-links --strict`.
- [x] 4.2 Update `backlog/items/017-queue-row-navigation-links/notes.md` with a session-log entry.
- [x] 4.3 Commit (single commit covering service_worker.js + player-ui.js + the openspec change directory + backlog updates) and move backlog item 017 to **Done** in `backlog/INDEX.md`.
