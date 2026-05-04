## Context

The Fomo Player browser extension injects an "Add to Fomo Player" button next to each track row on Bandcamp release pages. Bandcamp's own UI binds a click listener to the entire track row that navigates to the track's standalone page. Because the injected button sits inside that row, the row's listener fires after the button's own handler and the page navigates away before the add request resolves (or, when the row handler runs first via capture, it pre-empts the button).

The same button is also injected on standalone track pages, where there is no row navigation and the current handler works correctly.

## Goals / Non-Goals

**Goals:**
- Clicking the "Add to Fomo Player" button on a release page adds the track and keeps the user on the release page.
- The fix does not regress the working behaviour on track pages.

**Non-Goals:**
- Redesigning the injection strategy or the button DOM.
- Changing what "add" does on the backend.
- Touching unrelated Bandcamp injections (player overrides, queue button, etc.).

## Decisions

**Stop propagation at the button's click handler.**
The minimal fix is to call `event.stopPropagation()` (and `event.preventDefault()` if the button is rendered as a link/`<a>`) inside the button's click handler so the click never reaches Bandcamp's row listener. This is local to the extension code — no Bandcamp DOM or behaviour assumptions beyond what already exists.

Alternatives considered:
- *Re-parent the button outside the row.* Rejected — invasive, fragile against Bandcamp markup changes, and the button is intentionally next to the track for affordance.
- *Bind on the capture phase and swallow.* Rejected — capture-phase listeners on the row would still fire first; stopping propagation from the bubble phase on the button is sufficient because the button is the click target.

## Risks / Trade-offs

- [Risk: stopPropagation on the button breaks other extension listeners that rely on bubble-up from the button] → Mitigation: scope the stop to the button's own handler only; don't add it to ancestor handlers. Verify on a track page (which has no row navigation) that the button still works.
- [Risk: Bandcamp changes the row-click handler to use capture phase] → Mitigation: not a current problem; if it appears, revisit with a capture-phase listener on the button itself.
