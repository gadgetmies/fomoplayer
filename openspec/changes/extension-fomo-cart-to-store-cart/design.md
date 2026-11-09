## Context

The browser extension currently moves tracks one way — from store pages
into Fomo Player (single-page scrape, feed sync, wishlist sync, per-track
"Add to Fomo Player" dropdown). After a user has curated a Fomo Player
cart for a DJ set, the last-mile of *buying* every track is still manual:
re-locate each track on the store, click add-to-cart, set the price (on
Bandcamp), check out. This change closes that loop for the two purchase
stores: Bandcamp and Beatport.

The two stores have very different cart models:

- **Beatport** exposes a first-class cart API (`api.beatport.com/v4/my/carts/`
  for listing/creating, `<cart_id>/items/` for POSTing items). Multiple
  named carts per user are supported. A POST adds one track at a time with
  the body `{ item_id, item_type_id: 2, audio_format_id: 1, purchase_type_id: 1, source_type_id: 6 }`.
  Authorization is a bearer token sourced from `https://www.beatport.com/api/auth/session`
  (which returns a JSON body with `token.accessToken`); the bearer
  short-circuits the user's web session.
- **Bandcamp** has no add-to-cart API the extension can drive. Each release
  requires the buyer to set a price interactively on the release / track
  page. The closest automation is opening the track page in a background
  tab so the user can finish the add.

The MV3 service worker is the natural orchestrator: it already holds
`https://*.beatport.com/*` and `https://*.bandcamp.com/*` host permissions
(no new manifest scope), already brokers between popup and store-side
calls, and already persists run-status to `browser.storage.local` (the
existing `operationStatus` / `operationProgress` pattern).

The user-approved design lives at
`docs/superpowers/specs/2026-06-14-extension-fomo-cart-to-store-cart-design.md`.
This document captures the same decisions in OpenSpec form.

## Goals / Non-Goals

**Goals:**

- A Fomo Player user, with the extension installed and logged in to both
  Fomo Player and the target store, can push the contents of any of their
  Fomo Player carts toward the store's cart with a small number of
  clicks.
- Beatport pushes are a true one-way incremental sync into a named
  Beatport cart (`FOMO: <fomoplayer cart name>`): tracks the cart already
  has are not re-POSTed, repeated runs are safe.
- Bandcamp pushes open the right track page per Fomo Player track, in
  user-controlled batches sized by an Options-page setting, so a 60-track
  cart does not spawn 60 simultaneous tabs.
- An end-of-run summary surfaces every track that was not added —
  not-on-store and failures — with the ability to copy or download the
  list so the user can search for those tracks elsewhere.
- Run state survives MV3 popup unmount and service-worker idle/restart.

**Non-Goals:**

- Bidirectional sync. Items the user removes from the Beatport `FOMO:` cart
  are not propagated back to Fomo Player, and items removed from a Fomo
  Player cart are not removed from the Beatport cart.
- Cleanup or renaming of the Beatport `FOMO:` cart when the Fomo Player
  cart is renamed or deleted. v1 uses pure name-match linkage and accepts
  the rename-creates-new-cart edge.
- Bandcamp incremental sync (only-open-not-yet-pushed). Bandcamp's manual
  add means we cannot observe whether a tab actually resulted in a
  purchase; tracking what we've "pushed" without that signal is misleading.
- An abort-in-progress-run button. Dismiss is only available after the run
  reaches `completed` or `failed`.
- Spotify or any third store.
- The buying/paying flow itself — the user always completes purchase in
  the store's own UI.

## Decisions

**D1. Run state lives in `browser.storage.local`, written only by the
service worker.** Alternative: in-memory state on the worker, popup polls
via messaging. Rejected because MV3 service workers idle out and pop-ups
unmount on focus loss; either alone would lose progress. Storage doubles
as the popup's source of truth — popup reads on mount and subscribes to
`storage.onChanged`, the worker never has to push.

**D2. Beatport flow is named-cart incremental sync, not "always push".**
Alternative: always POST every track and trust Beatport's de-dup to
respond accordingly. Rejected because it produces noisy summaries (every
duplicate becomes an explicit POST round-trip) and because the user
explicitly asked for incremental sync into a named cart so repeated runs
add only what's new.

**D3. Beatport cart linkage is by exact name match (`FOMO: <name>`), not
by stored Beatport cart id.** Alternative: persist a
`fomoplayerCartId → beatportCartId` map locally so renames don't break the
link. Rejected for v1 — name match is dead simple, no migration / drift
concerns, and the rename edge (creates a new `FOMO: <new name>` cart on
Beatport, leaves the old one alone) is benign. Revisit if it becomes a
friction point.

**D4. Beatport per-track failures (including 401/403) do not abort the
run.** Alternative: 401/403 → abort because the session is dead anyway.
Rejected because it adds branching for one specific error that produces
the same correct outcome (a `Failed: <large number>` summary) under the
simpler "continue" rule. Keeps the loop linear and the summary
self-explanatory.

**D5. Bandcamp opens tabs in user-paced batches with manual "Open next
batch" advance.** Alternative A: auto-advance when the previous batch's
tabs all close. Alternative B: open everything at once. Rejected: A
couples our state to a noisy signal (tab close ≠ "user is done"), B kills
the browser on big carts. Manual advance trades a click for predictable
resource use. The Options-page batch size lets the user dial it: blank →
one batch of everything (alternative B opt-in), `1` → strictly serial.

**D6. Batch-size setting lives on the Options page, not per-run in the
popup.** Alternative: inline number input next to the cart picker.
Rejected for v1 — set-and-forget is the common case, and an inline
override is easy to add later if requested without breaking the storage
shape.

**D7. The cart-push UI is a single shared `CartPushSection` React
component parameterised by store.** Alternative: two parallel
implementations in `BeatportPanel.jsx` and `BandcampPanel.jsx`. Rejected
to avoid divergent copy-paste of the run-state rendering logic. The
component handles the two store-specific differences (`Open next batch`
button only when `store === 'bandcamp'`; `Already in cart` bucket only
when `store === 'beatport'`) via conditional rendering.

**D8. Track resolution reads the existing `stores` JSON returned by
`GET /api/me/carts/<id>` on the Fomo Player backend.** Alternative: a
new backend endpoint dedicated to "what's a track's Beatport item_id /
Bandcamp URL". Rejected as premature — the `stores` JSON already exists.
If the implementer finds the JSON does not yet carry the needed field
(Beatport `item_id`, Bandcamp URL), the design's fallback is to extend
the existing read-side query as part of this same OpenSpec change rather
than a separate proposal.

**D9. Single concurrent run across the whole extension.** Alternative: one
run per store, so a slow Beatport sync doesn't block a Bandcamp push.
Rejected for v1 because the run-state shape would need two slots and the
popup would need to render two simultaneous progress sections — premature
complexity for a feature that's already a multi-step interaction.

**D10. Worker startup re-checks `cartPushRun` and resumes Beatport runs.**
Alternative: don't resume — if the worker dies mid-run, the user has to
re-trigger. Rejected because Beatport pushes can be long (a 60-track cart
is 60 sequential POSTs); silent state loss across an idle event would be a
nasty surprise. Resume is cheap to implement: the queue is frozen at run
start, `processed` is an index into it, every POST persists, the resume
just reads from `queue[processed]`.

## Risks / Trade-offs

- **[Beatport API drift]** — Beatport's `/v4/my/carts/...` is undocumented
  externally and could change shape under us. → Each helper logs the raw
  response on parse failure (same pattern as the existing
  `fetchJsonForLogging` in `service_worker.js`), so failures are
  debuggable from the user's console. Endpoint discovery for "list cart
  items for de-dup" is an explicit narrow lookup
  (`getBeatportCartItemIds`) and any drift is contained to that helper.
- **[Beatport CORS / Origin enforcement]** — Devtools-console fetches
  against `api.beatport.com` failed CORS during exploration; the worker
  *should* bypass this via host permissions, but it's untested in
  production. → If the worker's direct fetch is rejected for missing
  `Origin: https://www.beatport.com`, the fallback is to relay the
  request through a content script on `www.beatport.com`. No manifest
  changes either way; the structure of the Beatport module makes the
  swap-in straightforward.
- **[Beatport cart-create endpoint unavailable]** — If `POST
  /v4/my/carts/` is locked down for some reason, the sync cannot create
  the `FOMO:` cart. → The run surfaces a deterministic error
  ("Could not create FOMO cart on Beatport — create a cart named
  'FOMO: <name>' on Beatport and re-run"). Once the user creates it
  manually, subsequent runs proceed normally (the list-and-find step
  picks up the manual cart). No data is lost.
- **[Tracks `stores` JSON missing the needed field]** — The `stores` JSON
  may not yet expose the Beatport `item_id` or Bandcamp track URL in the
  exact shape this feature wants. → Implementer extends the existing
  cart-tracks query as part of this OpenSpec change.
- **[Bandcamp tab spam]** — A user with `batchSize` blank and a big cart
  could open dozens of tabs at once and stall the browser. → Help text
  under the Options-page field warns about this; default is `10`. We
  intentionally do not impose a hard maximum — the user explicitly asked
  for a "no limit" option.
- **[Beatport release-vs-track dedup gap]** — If the user already has a
  release in their Beatport cart, individual tracks from that release
  will still be POSTed. → Documented as v1 limitation. The user sees the
  outcome in the summary (Beatport will either accept the duplicate POST
  or reject it as `failed`).
- **[Renames create orphan carts]** — Renaming a Fomo Player cart causes
  the next Beatport sync to create a new `FOMO: <new name>` cart and
  leave the old one. → v1 trade-off; v2 may persist a Fomo Player ↔
  Beatport cart-id map locally.

## Migration Plan

This is a new capability — no migration needed. The change introduces two
new keys in `browser.storage.local` (`cartPushRun`, `bandcampCartPushBatchSize`).
Both are read defensively (missing → defaults) so an extension update on
a populated profile does not break.

No new manifest permissions, no new content scripts beyond what's already
declared, no backend migrations.

Rollback strategy: the feature is gated behind the popup section and the
worker message handlers — reverting the change removes them. No data on
Beatport is destroyed by rolling back (the `FOMO:` cart, if created, stays
on the user's Beatport account).

## Open Questions

- **Beatport's "list cart items" endpoint shape.** The user provided a
  curl for `GET /v4/my/carts/<id>/?items=false&country=FI` but could not
  test the response with `items=true` due to console CORS. Implementer
  resolves during build by probing `items=true` and, if needed, falling
  back to `GET /v4/my/carts/<id>/items/`. The design's `getBeatportCartItemIds`
  helper isolates this discovery.
- **Does `country=FI` need to remain in cart-detail GETs from the
  worker?** Same source — couldn't test without it during exploration.
  Implementer omits it first, re-adds if the API requires it.
- **Whether the `stores` JSON in the cart-tracks response already
  exposes Beatport `item_id` and Bandcamp track URL** in the exact shape
  needed. If not, scope extends to the small read-side query change in
  `packages/back`.
