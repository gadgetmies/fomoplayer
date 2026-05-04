## Context

The current player markup (`packages/browser-extension/src/js/content/bandcamp/player-ui.js`) places the clear-queue icon button (`[data-clear]`) inside `.right` next to the queue-toggle button. The queue panel itself is a single element `<div class="queue hidden" data-q>` that doubles as both the visibility toggle target and the list container — `rebuildQueue` blasts its `innerHTML` on every render.

The previous change (`embedded-player-ui` capability) wired the queue-toggle label to read the `hidden` class on `[data-q]`. That assumes the same element is both the toggled wrapper and the rebuilt list, which is what blocks placing a persistent clear button inside the panel today.

## Goals / Non-Goals

**Goals:**
- The clear-queue control lives inside the queue panel and is reachable only when the panel is visible.
- A confirmation step gates the clear action.
- The clear control survives queue rebuilds (`rebuildQueue` should not wipe it).

**Non-Goals:**
- An undo affordance after clearing (explicitly out of scope per the backlog spec).
- Restyling the queue panel beyond what's needed to host the new button.
- Replacing the queue-toggle label/visibility plumbing established by the previous change.

## Decisions

**Split the panel wrapper from the rebuilt list.**
Introduce a new wrapper element `[data-queue-panel]` that owns the `hidden` class, and keep `[data-q]` as the inner list that `rebuildQueue` rewrites. The clear-queue button is a sibling of `[data-q]` inside the wrapper, so panel rebuilds don't touch it. The toggle click and `syncQueueToggleLabel` read/write the `hidden` class on `[data-queue-panel]` instead of `[data-q]`.

Alternatives considered:
- *Include the clear button in `rebuildQueue`'s template and re-bind its click on every rebuild.* Rejected — listener churn is wasteful, and any state we ever want to keep on the button (e.g. a future "are you sure?" inline confirm) would be lost on each rebuild.
- *Place the clear button outside the panel as a floating overlay.* Rejected — the spec asks for it inside the queue list view.

**Use `window.confirm()` for the confirmation prompt.**
Native, blocking, immediately well-understood by users, zero state to manage. The fat-finger problem is solved by *any* deliberate second action. Content-script context makes `confirm()` reliable here (no MV3 service worker concerns since this code runs in the page).

Alternatives considered:
- *Inline two-button confirm ("Clear queue?" / "Cancel").* More polished UX but adds a small state machine and extra markup. Worth considering as a follow-up but not necessary to satisfy the acceptance criteria.

## Risks / Trade-offs

- [Risk: `window.confirm()` looks dated / out of place against the dark player UI] → Mitigation: acceptable for this iteration; an inline confirm can replace it later without changing the spec contract (still "confirmation prompt before clearing").
- [Risk: splitting the wrapper inadvertently breaks the existing queue-toggle visibility wiring or `renderEmptyState`] → Mitigation: update both call sites in the same change; verify with the full Show/Hide flow during manual check.
