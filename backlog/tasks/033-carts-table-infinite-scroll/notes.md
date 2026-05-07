# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-06_ — Mirror the existing `hasMoreTracks` /
  `loadMoreTracks` shape for the carts view rather than generalising
  first. Generalisation can come once two concrete callsites exist
  and the right abstraction is obvious.

## Rejected approaches

- _YYYY-MM-DD_ — what was tried, why it didn't work.

## Open threads

- Reconciling `PATCH /carts/:id/tracks` (which currently returns the
  full cart) with paged frontend state — see Open questions in the
  README.
- Whether to surface a server-side total or rely on
  `page < limit ⇒ done` as the end-of-list signal.

## Session log

- _2026-05-06_ — Item created. Backend already supports `?offset=` /
  `?limit=` on `GET /carts/:id` (`packages/back/routes/users/api.js:345`);
  frontend `selectCart` (`packages/front/src/App.js:830`) currently
  ignores both. The main tracklist's infinite-scroll plumbing
  (`hasMoreTracks` / `loadMoreTracks` in `App.js`, `onLoadMore` in
  `Tracks.js`) is the working reference.
