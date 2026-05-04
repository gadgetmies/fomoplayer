## Context

The "Add to Fomo Player" cart dropdown lives in
`packages/browser-extension/src/js/content/bandcamp/cart-button.js` and is
rendered into a shadow DOM next to track rows on Bandcamp release / track /
discography pages. Today the dropdown:

- Renders one `.row` element per cart returned by the worker.
- On click, awaits `bandcamp:add-to-cart` and then writes a status message
  via `setStatus(...)` into a `data-status` block at the bottom of the
  popup. The clicked row itself receives no visual change.
- Auto-clears `setStatus` after 4 seconds and closes the popup on success.
- The new-cart `+` button does the same thing — it awaits two worker round
  trips (`bandcamp:create-cart` then `bandcamp:add-to-cart`) without
  inflight feedback on the button itself.

Item 009 will turn rows the track is already in into "click to remove"
entries; item 010 must cover both directions with the same affordance.

## Goals / Non-Goals

**Goals:**
- Immediate, in-place feedback on the element the user actually clicked
  (the row or the `+` button), so the user does not have to look elsewhere
  to know the click registered.
- Idempotent UI: the same row cannot be double-clicked into a duplicate
  add or remove while the first request is in flight.
- Recoverable errors: the row stays interactive after a failed add /
  remove so the user can retry without reopening the dropdown.
- Symmetric treatment of add, remove (item 009), and create-and-add.

**Non-Goals:**
- A general toast / notification framework (still out of scope, same as in
  item 015).
- Optimistic UI that updates the dropdown's "currently in cart X" state
  before the worker confirms — that belongs to item 009's design.
- Loading feedback for the queue's "Add to Fomo Player queue" buttons —
  item 015 owns those.
- Restyling the dropdown beyond what the new states require.

## Decisions

**Per-row `data-state` attribute drives the visual state.**
Each `.row` element gets `data-state="idle" | "loading" | "success" |
"error"`, with CSS rules in the existing shadow-DOM `STYLE` block selecting
on it (e.g. `.row[data-state="loading"]`). The click handler flips the
attribute synchronously *before* awaiting the worker, then flips it on
resolve / reject. This keeps the state local to the element the user
interacted with — no global "is anything in flight" tracking needed because
the dropdown is short-lived and per-track.

Alternatives considered:
- *Class swaps (`.row.is-loading`).* Equivalent in effect; `data-state`
  reads more explicitly with a single attribute that holds the current
  phase, which avoids accidentally leaving stale classes when the next
  state arrives.
- *A separate React-style state object reconciled into the DOM.* Rejected —
  the file deliberately avoids React; one attribute per row is simpler
  and matches the existing imperative shadow-DOM style.

**A pending `Set<rowKey>` guards re-entry.**
The handler refuses to re-enter for any row whose key (cart id for
existing rows, `__create__` for the new-cart `+` button) is already in a
local `pending` Set. This prevents double-fires from rapid clicks, even
on rows that are visually disabled but still receive the event.

**Reuse the frontend `Spinner` (`lds-ring`) markup + CSS.**
The frontend already ships a spinner at `packages/front/src/Spinner.js`
backed by `packages/front/src/SpinnerButton.css`: a `.loading-indicator`
wrapper containing four `<div>` children, animated by the `lds-ring`
`@keyframes` with staggered `animation-delay` per child. Border colour is
parameterised via `borderColor: <color> transparent transparent
transparent`.

Port that exact markup and CSS into `cart-button.js`'s shadow DOM rather
than authoring a new SVG spinner:

- Add the `.loading-indicator`, `.loading-indicator__small` rules and the
  `lds-ring` keyframes to the inline `STYLE` block, copied verbatim from
  `SpinnerButton.css`. Drop `loading-indicator__large` — only `__small`
  is used at this size.
- Provide a tiny `spinnerHTML(color)` helper in `cart-button.js` that
  returns the 4-div HTML string with inline `border-color: <color>
  transparent transparent transparent` per child, mirroring what
  `Spinner.js` does in React.
- The loading row swaps its leading icon for the spinner element; the
  row text becomes muted via a class. No external assets and no extra
  build step — the file stays a single shadow-DOM module.

Default colour: `#0687f5` (the existing button accent in the dropdown)
inside cart rows on white background; pass `#fff` for the `+` button when
it sits on the accent fill.

Alternatives considered:
- *A new SVG spinner.* Rejected — the frontend already has a vetted
  spinner and the visual language across surfaces should match. Copying
  it into the shadow DOM is a few lines and avoids drift.
- *Importing `Spinner.js` directly.* Rejected — `cart-button.js`
  intentionally avoids React and runs in a content script; pulling React
  in to render four `<div>`s would dwarf the rest of the file.

**Success / error states reuse the row, not the `data-status` block.**
- `success`: the row briefly (≈900 ms) shows a check icon and a
  success-tinted background, then the dropdown closes (mirroring today's
  `closeOpen()` behaviour). The 4-second auto-clear `setStatus` block is
  removed for the add path — the row is the feedback now.
- `error`: the row shows a warning icon and an error-tinted background,
  and a small inline message under the row text shows the worker's
  `error` string. The row returns to `idle` on the next user click so
  retry is one click. The popup stays open.

The bottom-of-popup `data-status` block is kept for create-cart-only
errors (cart-creation failure where there is no row yet to attach state
to) and for the "create succeeded but add failed" composite case.

**Create-and-add uses the same state machine on the `+` button.**
The `+` button gains the same `data-state` lifecycle. While in `loading`
it shows the spinner in place of the `+` icon and is disabled; on success
it briefly shows the check then the popup closes; on failure it shows the
error inline and re-enables.

**Remove-from-cart (item 009) shares the row state machine.**
Item 009 will introduce a row variant for "already in cart". When that
land happens, the same `data-state` lifecycle applies — the only delta
is the worker message (`bandcamp:remove-from-cart`) and the success
microcopy ("Removed" instead of "Added"). The CSS and the pending Set
are reused as-is. This change does not implement remove (that is item
009's scope) but the requirements / styles are written so item 009 only
has to wire its worker call into the existing handler.

## Risks / Trade-offs

- [Risk: an error row that auto-resets on next click could swallow the
  error before the user reads it] → Mitigation: the inline error text
  stays visible until the next click on *that row*; clicks on other rows
  or outside the row don't clear it. Worst case: the user sees the error
  for as long as they're hovering it.
- [Risk: spinner animation runs forever if the worker never responds
  (e.g. service worker crashed)] → Mitigation: wrap the in-flight await
  in a 15 s timeout that resolves to `{ ok: false, error: 'Request timed
  out' }`, surfacing the standard error state. The handler is short and
  the timeout is local — no new abstractions.
- [Risk: success-then-close races with the user clicking another row in
  the same brief window] → Mitigation: the pending Set blocks re-entry
  on the same row; clicks on a different row during the success window
  are still allowed, which is the existing behaviour and intuitive.
- [Risk: shadow-DOM CSS gets noisy as more states accrue] → Mitigation:
  the new rules are scoped to `.row[data-state="…"]` selectors and add
  ~20 lines to the existing inline `STYLE`. Acceptable for a self-
  contained component; if it grows further, extract to a constant in a
  follow-up.
