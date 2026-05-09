## Context

`packages/front/src/Tracks.js` renders the user's primary track list
across the `new`, `recent`, `heard`, and `carts` views. Until commit
`78fda47d`, the `new` / `recent` / `heard` views had a `SpinnerButton`
in `<tfoot>` labelled "Refresh" that called the same handler the
backing `Tracks` component now exposes as `refreshTracks()`. The
removal commit replaced that button with touch-driven pull-to-refresh
on the `<tbody>` (`onTouchStart` / `Move` / `End`, gated by
`isPullToRefreshAvailable()`), and the foot now renders a row only for
the `carts` paging buttons. Desktop / mouse users have no in-app
refresh: clicking and dragging on a desktop browser does not trigger
the `onTouch*` handlers, so they reach for `Cmd-R` / `F5`, which
reloads the SPA shell and discards `Tracks` state (scroll position,
queue focus, transient filters).

## Goals / Non-Goals

**Goals:**

- Restore an in-app refresh affordance for desktop / non-touch users
  on `new`, `recent`, and `heard` views.
- Reuse the existing `refreshTracks()` flow and `state.updatingTracks`
  so the in-flight, success, and failure paths stay unified across the
  two affordances.
- Keep pull-to-refresh exactly as it is on touch devices.

**Non-Goals:**

- Changing the underlying refresh action or the
  `onUpdateTracksClicked` contract (out of scope per the backlog item).
- Reworking the pull-to-refresh visual or threshold.
- Adding a keyboard shortcut for refresh (tracked separately).
- Adding a refresh button to the `carts` view — `carts` already has
  prev/next paging in `<tfoot>` and was not part of the removed
  refresh affordance.

## Decisions

### Detect non-touch via media query, not UA sniffing

Use `(hover: hover) and (pointer: fine)` to decide whether to render
the button. Read it once via `window.matchMedia(...)` and subscribe to
`change` so the gating updates if the user docks / undocks an input
device.

- *Why:* The CSS Media Queries Level 4 pointer/hover features are the
  standard signal for "user has a precise pointing device" and avoid
  the well-known fragility of UA sniffing.
- *Alternative considered:* Always render the button. Cheaper to
  implement but produces a redundant control on phones / tablets
  alongside the gesture, which is the kind of UI cruft this codebase
  generally avoids. Falling back to "always render" is the recovery
  path if the media-query approach turns out to misclassify a
  meaningful slice of devices.
- *Alternative considered:* Reuse `isMobile` (already imported in
  `Tracks.js`). It is a UA-derived boolean and tablets-with-mouse or
  touch laptops would be misclassified. The media query is closer to
  the actual capability we care about.

### Hybrid devices — prefer showing the button

A device that matches *both* `(hover: hover)` and has touch
(touch laptops, iPads with a Magic Keyboard) will pass the media query
and see the button while pull-to-refresh remains active. This is
intentional: a redundant control is mildly ugly; a desktop-class user
with no refresh path is a regression that hits a power user every
session. The duplicate-affordance failure mode is the cheaper one.

### Place the button in the existing `<tfoot>` slot

The removal commit emptied the `<tfoot>` for non-`carts` views. Re-add
a `<tr>` there that mirrors the previous `SpinnerButton` (same size
rule, `loading={this.state.updatingTracks}`) and wire `onClick` to
`refreshTracks()`. Keep the cart-paging branch unchanged.

- *Why:* It's where the button used to live, the layout already
  reserves the slot for foot rows, and putting it in `<tfoot>` keeps
  it out of the virtualised `<tbody>` scroll area — no risk of it
  being recycled as the user scrolls.
- *Alternative considered:* Place the button in the table header next
  to the existing column controls. Rejected — the header row is
  already dense and the previous placement at the bottom is what
  desktop users had muscle memory for.

### Reuse `refreshTracks()` and `state.updatingTracks`

The button's `onClick` calls the same `refreshTracks()` method that
the touch handlers call, and binds `loading` / `disabled` to
`this.state.updatingTracks`. No new state, no new method.

- *Why:* The pull-to-refresh path already serialises concurrent
  refreshes (`updatingTracks` guard in `handleTouchStart`) and handles
  errors via the `try/finally` in `refreshTracks`. Sharing the flag
  means a refresh kicked off by either affordance disables the other,
  which is the desired behaviour.

## Risks / Trade-offs

- **Hybrid-device duplication** → mitigated by the explicit decision
  above; the duplicate is acceptable.
- **Media-query support in older browsers** → `(hover)` /
  `(pointer)` are supported by every browser the project otherwise
  targets (the codebase uses `window.matchMedia` elsewhere). If
  `matchMedia` returns `undefined` for the query, treat it as "show
  the button" — same fallback as hybrid devices.
- **Event listener leak** → the `change` listener on the `MediaQueryList`
  must be removed in `componentWillUnmount`. `Tracks` already has a
  resize listener pattern to follow.

## Migration Plan

Pure additive client change. Ship in a single commit; no schema, API,
or build pipeline impact. Rollback is reverting the commit.

## Open Questions

- None. The "non-touch" detection question raised in the backlog item
  is resolved by the media-query decision above with the
  hybrid-device fallback.
