## Context

`bandcamp-feed-sync` today ingests one source: the JSON returned by `https://bandcamp.com/fan_dash_feed_updates`, filtered to `story_type === 'nr'`. The popup's Feed sync calls into the worker, which paginates that endpoint and accumulates `nr` entries into `bandcampReleases`, which are later opened tab-by-tab to scrape `TralbumData`.

A second source exists for the same surface: the **"New Releases from artists you follow"** panel rendered on `https://bandcamp.com/<username>/feed`. It is server-side rendered into the page HTML inside `<div id="new-releases-vm" class="new-releases">`, with each release item carrying its full descriptor as a JSON blob in a `data-item-json` attribute on `<li class="new-release …">` elements. Items in this panel are not present in `fan_dash_feed_updates` responses, so today we silently miss them.

Reference data captured locally: `temp/feed.html` (a logged-in render of the feed page) and `temp/feed.json` (the corresponding `fan_dash_feed_updates` body). The HTML confirms the panel's location and JSON-attribute shape.

## Goals / Non-Goals

**Goals:**

- Make a single Feed-sync run cover both sources (panel + `fan_dash_feed_updates`).
- Emit one combined `releases` stream to the rest of the worker so downstream queueing / ingestion code is unchanged.
- Deduplicate items that appear in both sources (some overlap is expected for very recent releases).
- Surface failures of the new path through the existing `FeedShapeError` channel — no new error categories, no new popup states.
- Add fixture-driven parser tests so a future Bandcamp page change either passes (still finds the panel) or fails loudly (no silent regression to today's gap).

**Non-Goals:**

- Caching panel data across runs.
- Changing popup UX, progress UI, or error UI.
- Moving wishlist sync into the worker.
- Adding manifest permissions — the `bandcamp.com` origin is already covered.

## Decisions

### Decision: Source the followed-artists panel from the rendered feed-page HTML, not from a separate API

**Rationale:** The reference capture (`temp/feed.html`) shows each release's complete metadata embedded as `data-item-json` on `<li class="new-release">` items inside `<div id="new-releases-vm">`. That blob is the same shape Bandcamp's own JS hydrates from. There is no observed companion JSON endpoint that returns *only* the panel data, and reverse-engineering one would be fragile.

**Alternatives considered:**

- *Companion endpoint discovery.* Skipped — speculative and fragile; the rendered page is stable today and changes visibly when Bandcamp rearranges the feed UI.
- *Run a content script in the feed page tab.* Skipped — would re-introduce the subdomain coupling that item 021 explicitly removed (Feed must work from any tab via the worker).

### Decision: Service worker fetches and parses the HTML directly; DOM-free string parsing

**Rationale:** MV3 service workers have no `DOMParser`. We extract panel items by:

1. Asserting the sentinel `id="new-releases-vm"` is present in the body. This confirms we got a logged-in feed page (login redirects do not contain this marker). Absence of the sentinel triggers `FeedShapeError`.
2. Globally matching every `<li[^>]*\bclass="new-release\b[^"]*"[^>]*\bdata-item-json="([^"]+)"` in the body. The `class="new-release"` marker is specific to the panel — it is not used by other surfaces on the feed page (verified against the captured `temp/feed.html`, which has 40 such items, all inside the panel).
3. HTML-decoding each captured value (`&quot;`, `&amp;`, `&#39;`, `&lt;`, `&gt;`) and `JSON.parse`-ing.

We deliberately do **not** try to slice the HTML between `<div id="new-releases-vm">` and a balanced closing `</div>` — the panel contains deeply nested markup and balancing `<div>` opens against closes via regex is fragile. The class-marker approach is both simpler and more robust to future markup changes inside the panel.

**Alternatives considered:**

- *Slice by panel container.* Rejected for fragility (see above).
- *Run extraction in an offscreen document with `DOMParser`.* Rejected — adds a one-time setup cost and a moving part for what is effectively a single regex against a stable embed.
- *Inject a content script into a hidden tab.* Rejected — same subdomain/visibility complications item 021 removed.

### Decision: Hidden ("show more") items are ingested too

**Rationale:** The panel renders all releases server-side and visually collapses overflow behind a `show more new releases` toggle. The collapse is pure CSS (`#new-releases-vm .collection-grid li.new-release` past the visible cutoff carries `display: none`); every item is already in the DOM with its full `data-item-json` blob. The captured `temp/feed.html` shows 40 items present, only a subset of which are initially visible.

The regex-based extractor reads raw HTML and ignores computed CSS, so hidden items are captured without any extra work — but the requirement is worth making explicit so a future refactor (e.g. moving extraction into a DOM context) does not silently drop them by querying only visible nodes. The parser SHALL yield every `<li class="new-release">` in the page regardless of visibility.

**Alternatives considered:**

- *Filter to visible items only.* Rejected — defeats the whole purpose of the change. Bandcamp's collapse is a presentation choice, not a coverage signal.

### Decision: New parser lives next to `parseFeedPage` in `feed-parse.js`

**Rationale:** Both parsers operate on the same logical capability ("Bandcamp feed sync") and share `FeedShapeError` and the panel-vs-redirect detection idiom. Keeping them in one file means a future shape shift on either source is found by reading one file. The existing `parseFeedPage` stays unchanged; we add `parseFollowedArtistsPanel(html)` and a small helper that turns its output into the same `release`-shaped objects the rest of the worker consumes.

### Decision: Dedup on `item_url`, fall back to `item_id`

**Rationale:** Both sources expose `item_url` as the canonical, human-stable identifier and `item_id` as the dense numeric id. Bandcamp has historically reused numeric ids across stores in edge cases, so `item_url` is the safer first-choice key. `item_id` falls back when `item_url` is missing on either side (defensive — neither source is currently observed to omit it).

The dedup composes two arrays into one `Map` keyed first by `item_url` and second by `item_id`. The first occurrence wins (the panel is fetched first, so its richer JSON shape is preferred when the same release appears in both).

### Decision: Run the panel fetch once, before the paginated `fan_dash_feed_updates` loop

**Rationale:** The panel is a single page request and yields a bounded set (Bandcamp shows roughly the top N new releases — see `data-item-count` in the `<div id="new-releases-vm">` block). The pagination loop, by contrast, walks back in time and is the natural place to mark `done=true` on the last page. Doing the panel first lets us:

- Emit panel results into the existing accumulator (`ingestBandcampFeedReleases({ data, done: false })`) before the loop even starts.
- Keep the loop's terminal `done=true` semantics untouched.
- Surface a panel failure before we burn five paginated requests.

A panel parse failure (markup absent, login redirect HTML) throws `FeedShapeError` with the same human-readable message, surfaced via the worker's existing error path. A successful fetch with an empty panel (a brand-new account follows nobody yet) returns `[]` without error.

### Decision: Discover the username, then fetch `https://bandcamp.com/<username>/feed`

**Rationale:** `https://bandcamp.com/feed` (no username) returns 404 — Bandcamp does not redirect that path. The canonical feed URL is `https://bandcamp.com/<username>/feed` (the same URL Bandcamp's own menubar uses, e.g. `https://bandcamp.com/elysion/feed?from=menubar`). The worker therefore needs to discover the logged-in username before it can fetch the panel.

**Username discovery, in order:**

1. **`collection_summary` body.** The worker already fetches `https://bandcamp.com/api/fan/2/collection_summary` for `fan_id`. The same body may include a `username` field (shape unverified from prior usage). Try `collectionBody.fan?.username` then `collectionBody.username`.
2. **Fallback: parse `pagedata` from `https://bandcamp.com/`.** Every logged-in Bandcamp page renders a `<div id="pagedata" data-blob="…">` blob whose decoded JSON exposes `identities.fan.username` — verified against the captured `temp/feed.html`, where it reads `"username":"elysion"`. If the dashboard fetch is non-2xx or the blob is missing/unparseable, treat that the same as a missing-`fan_id`: throw the existing "logged out from worker context" error.

The lookup is logged when it falls through to the fallback so future runs reveal whether `collection_summary` actually carries the username — if yes, the second fetch becomes dead code we can remove later; if no, the fallback is the durable path.

**Alternatives considered:**

- *Fetch `https://bandcamp.com/feed` and rely on redirect.* Empirically wrong — 404, no redirect.
- *Scrape the menubar feed link.* The menubar is rendered client-side by Vue (the user-supplied snippet has `data-v-…` and is hydrated, not server-rendered) — not reachable from raw HTML.
- *Hit a `/whoami`-style endpoint.* No documented endpoint; would be speculative.

### Decision: Parser tests use synthetic fixtures, not the captured `temp/feed.html`

**Rationale:** `temp/feed.html` is uncommitted user-specific data (real `fan_id`, real follows) and exceeds 7K lines. Tests live alongside the parser under `packages/browser-extension/src/js/content/bandcamp/__tests__/` and use small hand-written fixtures that exercise:

- Happy path: a `<div id="new-releases-vm">` with two `<li class="new-release" data-item-json="...">` items.
- Empty panel: container present, zero items → returns `[]`.
- Missing container: container absent (login redirect HTML) → throws `FeedShapeError`.
- Merge / dedup: panel and `fan_dash_feed_updates` outputs containing one shared `item_url` → combined output contains it once, preferring the panel entry.

The captured `temp/feed.html` stays usable as a manual sanity check via a small Node script the contributor runs locally, but is not wired into CI.

### Decision: Filter out custom-domain releases (host outside `*.bandcamp.com`) from both sources

**Rationale:** A release whose `item_url` is on a custom artist domain (e.g. `https://shallnotfade.co.uk/album/back-2-earth`) cannot be scraped by the existing `fetchBandcampReleaseInTab` flow — `browser.scripting.executeScript` rejects with `"Extension manifest must request permission to access this host"` because the manifest only declares `https://*.bandcamp.com/*`. This is a pre-existing limitation of the worker scrape path; `fan_dash_feed_updates` items would hit it too, the user just hadn't encountered one. The followed-artists panel makes such releases noticeably more common because Bandcamp surfaces the full new-release set for every followed artist.

The OpenSpec change explicitly forbids new manifest permissions (introducing `<all_urls>` would be a privilege escalation requiring user re-consent on every install), so the only correct option is to **drop custom-domain releases at parse time** rather than letting them propagate and crash the per-release tab scrape later. The filter applies symmetrically to panel results and `fan_dash_feed_updates` results so behaviour is consistent across sources, and the worker logs the dropped count per source so we can observe how much coverage we're losing.

**Alternatives considered:**

- *Add `<all_urls>` host permission.* Rejected — outside the change's scope and requires user re-consent on every install.
- *Filter only the panel source.* Rejected — `fan_dash_feed_updates` has the same problem and the same fix; treating them differently would be inconsistent.
- *Filter inside `fetchNextBandcampItem` rather than at parse time.* Rejected — the release would still be queued, the tab would still open, and the failure would be deeper in the call stack. Filtering at parse time keeps the worker's `bandcampReleases` queue clean and consistent with the rest of the flow.

## Risks / Trade-offs

- **HTML scraping is more brittle than a JSON endpoint.** Bandcamp can rename the container, switch to client-side hydration, or change attribute names without notice. **Mitigation:** the parser fails loudly (`FeedShapeError` with an actionable message), the existing `parseFeedPage` path remains independent, and the unit test fixtures lock in the expected shape. A future shape break shows up as a single targeted test failure plus the user's existing popup error UX.
- **One additional HTTP request per sync run.** It's a credentialed GET against an origin we already use; rate-limit risk is comparable to `fan_dash_feed_updates`. **Mitigation:** none needed beyond running the panel fetch once per sync, not per page.
- **`data-item-json` regex could overmatch on a future Bandcamp redesign.** **Mitigation:** the regex is bounded to the slice between the panel container's opening tag and its closing `</div>`, and each match is JSON-validated — items that fail to parse are dropped with a `console.warn` rather than crashing the sync.
- **Dedup preference (panel wins) hides a panel-vs-feed-updates field divergence.** If the two sources ever produce meaningfully different metadata for the same release, we silently choose the panel's. **Mitigation:** acceptable today — both sources downstream feed the same `fetchNextBandcampItem` flow which reopens each release's tab and re-scrapes `TralbumData`, so source-side metadata divergence is overwritten.

## Migration Plan

No data migration. The change is shippable as a single extension update:

1. Land parser + worker wiring + tests behind no flag.
2. Existing users see strictly more coverage on the next Feed sync.
3. Rollback: revert the extension build. There is no backend or storage change to unwind.

## Open Questions

- Should the panel fetch be retried once on transient failure (e.g. 5xx)? Current proposal: no — Feed sync is user-initiated and can be re-run from the popup. Revisit only if telemetry shows recurring transient failures.
- Should we also persist a "last seen panel item_url" so future runs can short-circuit when nothing new appeared? Out of scope — listed as a follow-up if the feature lands and we want to reduce per-sync cost.
