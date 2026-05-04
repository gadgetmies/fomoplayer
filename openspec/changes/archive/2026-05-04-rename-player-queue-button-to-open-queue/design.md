## Context

The browser extension renders a small embedded player on Bandcamp pages (`packages/browser-extension/src/js/content/bandcamp/player-ui.js`). Inside that player there is a button that toggles a queue panel; today its visible text reads "Queue". On the same Bandcamp pages, the extension also injects per-track action buttons whose label is also "Queue" but whose action is "add this track to the queue". Same word, two opposite verbs.

The queue panel's visibility is controlled by toggling a `hidden` class on the `[data-q]` element from the toggle button's click handler. The panel starts hidden, and `renderEmptyState` re-hides it.

## Goals / Non-Goals

**Goals:**
- The toggle button reflects what the click will do: it reads "Show queue" while the panel is hidden, and "Hide queue" while it is visible.
- The accessible name (`aria-label`) and tooltip (`title`) track the visible label.

**Non-Goals:**
- Re-labelling per-track Queue buttons on Bandcamp pages.
- Re-styling the button or moving it.
- Adding new keyboard shortcuts or behaviours.

## Decisions

**Drive the label off the panel's `hidden` class.**
The panel's visibility is already a single source of truth (the `hidden` class on `refs.queue`). Adding a small `syncQueueToggleLabel` helper that reads that class and writes the button's `textContent`, `title`, and `aria-label` keeps the label honest in every code path that toggles the panel — both the explicit toggle click and the implicit re-hide inside `renderEmptyState`.

Alternatives considered:
- *Mirror visibility in a separate variable.* Rejected — two sources of truth invites drift. The class is already authoritative.
- *Listen for class changes via MutationObserver on the panel.* Rejected — overkill for a single helper call after each known toggle site.

**Same string for textContent, title, and aria-label.**
Setting `aria-label` redundantly against visible text is normally an accessibility anti-pattern, but the acceptance criterion explicitly requires the accessible name and tooltip to agree with the visible label. Using one string everywhere satisfies that criterion without surprising assistive tech.

## Risks / Trade-offs

- [Risk: a future code path toggles the panel without calling `syncQueueToggleLabel`, leaving the label stale] → Mitigation: there are only two toggle sites today (the click handler and `renderEmptyState`); both call the helper. A code reviewer can grep for `refs.queue.classList` to spot any new toggle site.
