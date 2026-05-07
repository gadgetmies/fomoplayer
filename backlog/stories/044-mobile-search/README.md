# Story 044 — Search

A Search tab with a pill-based query input, entity-type suggestions,
debounced server calls, recent / saved searches, deep-linkable URLs,
and a one-tap "subscribe to push notifications for this search"
shortcut.

## User-facing change

A user opens the Search tab and types — text turns into committed
"pills" (artist, label, genre, generic text) with native autocomplete
suggestions. Results appear after a short debounce. Recent searches
persist across launches; users can save a search for one-tap recall and
optionally subscribe to push notifications for new tracks matching it.
Sharing a search link opens the same search inside the app.

## Why

Search is the second-most-used surface after the track lists. The web
search bar's pill-and-debounce ergonomics are good and worth porting,
but it deserves a dedicated tab on mobile rather than a top-bar slot.

## "Done" looks like

- Pill input handles parse / commit / remove of search terms (port
  `searchTerms.js` logic).
- Entity-type suggestions (artist, label, genre) appear as the user
  types and autocomplete to a committed pill on tap.
- Results render in the same row component as the Tracks tab.
- Recent searches stored in `AsyncStorage`; saved searches persisted
  via the existing notifications endpoint (saved-search ↔ subscription
  is the same backend record).
- Deep link `fomoplayer://search?q=…&names=…` opens the app with that
  search applied.
- One-tap subscribe / unsubscribe to push notifications for the
  current search.

## Tasks

- [077 — Search screen with pill input](../../tasks/077-mobile-search-screen)
- [078 — Entity suggestions panel](../../tasks/078-mobile-entity-suggestions)
- [079 — Recent + saved searches](../../tasks/079-mobile-recent-saved-searches)
- [080 — Notification subscribe shortcut from search](../../tasks/080-mobile-search-subscribe-shortcut)
