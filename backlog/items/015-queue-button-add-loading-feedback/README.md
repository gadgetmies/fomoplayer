---
id: 015
title: Loading feedback while adding tracks to the queue
status: todo
priority: P1
effort: S
created: 2026-05-04
depends-on: []
---

# Loading feedback while adding tracks to the queue

## Why

When a user clicks one of the injected Queue buttons on Bandcamp (per-track,
release-level, or discography), enqueueing can take a noticeable moment —
especially when the worker has to fetch a release Tralbum on the
discography path, or when the release has many tracks. Today the click
gives no visible response: the button stays idle, the queue list (if open)
doesn't change until the request resolves, and impatient users click again
or wonder whether the click registered. We need clear "I heard you, working
on it" feedback.

## What

- While an enqueue request is in flight from a given Queue button, that
  button **must show a spinner** and **must be disabled** (no second click
  while the first is pending).
- While *any* enqueue request is in flight, the embedded player's queue
  list **must show a spinner / "Adding…" row at the end** so the user can
  see that something is on its way even if they're looking at the queue
  panel rather than the source page.
- When the request resolves (success or failure), the button returns to
  its normal state and the spinner row disappears.

## Acceptance criteria

- [ ] Clicking a Queue button immediately shows a spinner inside the
      button and disables further clicks until the request settles.
- [ ] The bottom of the queue list (`[data-q]`) shows a spinner / "Adding…"
      row whenever at least one enqueue is in flight; the row disappears
      once all in-flight adds settle.
- [ ] On failure, the button re-enables and a brief error indication is
      shown (status text in the player or a console warning is enough for
      this iteration — a full toast system is out of scope).
- [ ] Two near-simultaneous Queue clicks on different tracks each show
      their own button spinner; the queue-list row stays as long as either
      is pending.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/inject.js` —
  `cueButton` factory and the three call sites (release-title, per-track,
  discography). The click handler is the natural place to flip a pending
  state.
- `packages/browser-extension/src/js/content/bandcamp/player-ui.js` —
  `rebuildQueue` builds the list HTML; needs a way to render an extra
  pending-row at the tail. Consider a separate "pending adds" counter in
  the UI state, fed via a runtime broadcast from the worker (e.g.
  `audio:enqueue-pending` / `audio:enqueue-settled`) or a simpler
  per-tab content-script counter.
- `packages/browser-extension/src/js/service_worker.js` and
  `packages/browser-extension/src/js/audio-player.js` — message handling
  for `bandcamp:enqueue` / `audio:enqueue` if the pending signal needs to
  ride the same path.
- `packages/browser-extension/src/js/content/bandcamp/cart-button.js` —
  item 010 already ports the frontend `Spinner` (`lds-ring`) markup +
  CSS into a `spinnerHTML(color)` helper inside that file's shadow-DOM
  `STYLE` block. **Before adding the same to `inject.js` /
  `player-ui.js`, extract the spinner to a small shared module**
  (e.g. `content/bandcamp/spinner.js` exporting `SPINNER_CSS` and
  `spinnerHTML(color)`) and have `cart-button.js`, the Queue buttons,
  and the queue-list pending row all consume it. Avoids three copies of
  the same `lds-ring` keyframes drifting independently. Note that
  `cart-button.js` lives in a shadow DOM (CSS must be inlined into its
  `<style>`) but the Queue buttons in `inject.js` and `player-ui.js`
  inject directly into the page DOM, so the shared module needs to
  expose the CSS as a string callers can either inline (shadow) or
  inject once into a `<style>` tag (page DOM).

## Out of scope

- A full toast / notification framework.
- Loading feedback for the "Add to Fomo Player" cart button (covered by
  item 010).
- Reordering or animating the spinner row beyond a simple "Adding…" line.

## Open questions

- Where does the pending-counter live? Content-script local (simple, but
  doesn't survive tab boundary) vs. broadcast through the audio host
  (uniform with how queue state already flows). Likely content-script
  local is enough since the affected UI is the per-tab embedded player.
