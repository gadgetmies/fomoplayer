# Story 042 — Track lists & row actions

The Tracks tab: New, Recent, and Heard lists with infinite scroll,
pull-to-refresh, sort/filter sheet, and per-row swipe actions for the
common positive actions plus a long-press menu for the rest.

## User-facing change

A user on the Tracks tab can swipe between New / Recent / Heard, scroll
through hundreds of tracks smoothly, pull down to refresh, swipe a row
to add to their default cart or mark heard, long-press a row for a full
action menu (add to a specific cart, mark purchased, ignore artist /
label / release, follow artist / label, share), and tap a header
control to open a sort/filter sheet (sort field, limit, "added since",
"only new").

## Why

This is the app's centerpiece. It's where most users spend most of
their time. Native list ergonomics — virtualization, gestures, sheets
— make the difference between "feels like a website inside an app" and
"feels like a real app".

## "Done" looks like

- New / Recent / Heard list screens render at 60 fps on mid-tier
  hardware with hundreds of items, using `FlatList` (or `FlashList`)
  + paginated React Query infinite queries.
- Pull-to-refresh and "load more" footer + empty / loading / error
  states are all wired.
- Track row shows artists/title, label, genres, score, store icons,
  release date — same fields the web row shows.
- Right-swipe → add to default cart (with an undo snackbar);
  left-swipe → mark heard (idempotent, optimistic).
- Long-press → action sheet with: add to specific cart, mark purchased,
  ignore artist / label / release, follow artist / label, share track.
- Sort + filter bottom sheet exposes the same parameters as the web
  query string (sort, limit, addedSince, onlyNew) and persists across
  list changes.

## Tasks

- [065 — List screens for new / recent / heard with infinite query](../../tasks/065-mobile-track-list-screens)
- [066 — Pull-to-refresh + load-more + empty/error states](../../tasks/066-mobile-list-states)
- [067 — Track row component](../../tasks/067-mobile-track-row-component)
- [068 — Per-row swipe actions (cart + heard)](../../tasks/068-mobile-row-swipe-actions)
- [069 — Sort & filter bottom sheet](../../tasks/069-mobile-sort-filter-sheet)
- [070 — Long-press action sheet](../../tasks/070-mobile-row-action-sheet)
