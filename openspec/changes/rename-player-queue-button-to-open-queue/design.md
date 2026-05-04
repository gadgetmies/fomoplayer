## Context

The browser extension renders a small embedded player on Bandcamp pages (`packages/browser-extension/src/js/content/bandcamp/player-ui.js`). Inside that player there is a button that opens a queue panel; today its visible text reads "Queue". On the same Bandcamp pages, the extension also injects per-track action buttons whose label is also "Queue" but whose action is "add this track to the queue". Same word, two opposite verbs.

This change is a label-only edit. The per-track injection buttons stay as-is.

## Goals / Non-Goals

**Goals:**
- The queue-toggle button's visible label, accessible name, and tooltip all read "Open queue".

**Non-Goals:**
- Re-labelling per-track Queue buttons on Bandcamp pages.
- Re-styling the button or moving it.
- Adding any new keyboard shortcuts or behaviours beyond the rename.

## Decisions

**Use both `title` and `aria-label`, set to the same string as the visible text.**
The current button has neither — the text content alone is the accessible name. Adding a redundant `aria-label` is normally an accessibility anti-pattern (it overrides the visible text for screen readers without any benefit), but the acceptance criterion explicitly asks for the aria-label and tooltip to agree with the visible label. Setting them all to the same value satisfies the criterion without surprising assistive tech: the screen-reader name still matches what users see, and the tooltip on hover spells out the same string.

Alternatives considered:
- *Visible text only, no `title` / `aria-label`.* Closer to ideal accessibility, but doesn't satisfy the acceptance criterion as written.
- *Different aria-label (e.g. "Open queue panel").* Rejected — diverging from the visible label is what the criterion forbids.

## Risks / Trade-offs

- [Risk: someone later reads the empty-state hint "Click 'Queue' next to a Bandcamp track or release" and renames the per-track buttons too] → Mitigation: proposal explicitly scopes the per-track buttons out; the spec scenario for the player view's queue-toggle pins the new label.
