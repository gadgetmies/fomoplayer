---
id: 223
title: Tracks infinite-scroll re-fetches in a loop when the next page returns no new items
effort: M
created: 2026-05-09
---

# Tracks infinite-scroll re-fetches in a loop when the next page returns no new items

## Why

Reported during verification of task 032 (restore desktop refresh
button): when the user reaches the bottom of the `new` / `recent` /
`heard` track list, the auto-load fires a fetch; if the fetch returns
items that all dedupe to zero net-new tracks, the auto-load can fire
again, and again. Wasted requests, server load, and a stuttery feel
in the UI when scrolling near the end of a list. Pre-existing — not
introduced by 032.

## What

Make the loop terminate when a page returns zero net-new tracks.
Concretely: stop calling `onLoadMore()` for the same `tracks.length`
value once a previous fetch at that length produced no growth, until
something genuinely changes (new server-side activity, the user
scrolls, a refresh, etc.).

The fix has to handle the two interacting code paths together:

- The server-pagination signal (`App.hasMoreTracks` in
  `packages/front/src/App.js`) reports `has more` based on
  `pagination.{category}.offset + .count < .total` — independent of
  whether the *client* actually grew its visible list after dedupe.
  When dedupe wipes the page, the server signal still says "more
  available" and the client keeps asking.
- The client guard
  (`Tracks.tryAutoLoadMoreWithoutScroll.lastAutoLoadRequestedTrackCount`
  in `packages/front/src/Tracks.js`) is meant to suppress repeats at
  the same `visibleTrackCount`, but it gets reset to `null` whenever
  `hasScrollableOverflow` flips true (e.g. transient layout shifts)
  or `hasMore` flips, so it does not reliably hold across the
  fetch-completion cycle. Once it's reset, the next call with the
  same `visibleTrackCount` is no longer a guard hit.

## Acceptance criteria

- [ ] When a `loadMoreTracks` call resolves and `tracks.length` did
      not increase, no further auto-load is triggered for that same
      `tracks.length` until a real state change (user scroll, manual
      refresh, server-side new activity that bumps `pagination.total`
      or arrives via a separate `updateTracks`).
- [ ] When a manual refresh (`refreshTracks` →
      `App.updateTracks(false)`) lands new data, auto-loading
      resumes normally — the suppression is per-`tracks.length`
      snapshot, not a permanent disable.
- [ ] The `handleScroll` path is also gated by the same guard, not
      only `tryAutoLoadMoreWithoutScroll` — otherwise a small upward
      scroll followed by a downward scroll re-arms the loop.
- [ ] No regression: a page that genuinely returns new tracks still
      grows the list and lets a subsequent auto-load fire.
- [ ] Manually verified by triggering the failure (e.g. force the
      server response to be a duplicate of the current page, or use
      a small dataset where pagination overshoots `total`) and
      observing exactly one fetch at the bottom, not a stream of
      them.

## Code pointers

- `packages/front/src/App.js:151` — `hasMoreTracks()` derives the
  signal from server pagination only; doesn't observe whether dedupe
  actually grew the client list.
- `packages/front/src/App.js:165` — `loadMoreTracks()` flips
  `loadingMore` and awaits `updateTracks(true)`. Good place to record
  "the last attempted-load `tracks.length` produced no growth" so a
  re-attempt at the same count can be short-circuited.
- `packages/front/src/App.js:493-548` — append branch of
  `updateTracks`. After dedupe, `uniqueNew/Heard/Recent` is what
  actually went into state. Comparing pre- vs post-length here is the
  cheapest place to set the no-growth flag.
- `packages/front/src/Tracks.js:393-420` —
  `tryAutoLoadMoreWithoutScroll` and the
  `lastAutoLoadRequestedTrackCount` guard. The guard's reset
  conditions are the leak.
- `packages/front/src/Tracks.js:465-473` — `handleScroll`'s
  `onLoadMore` call has no per-count guard; if added at `App` level,
  this path is automatically gated too.

## Out of scope

- Fixing the related "fetch not launched when scrolling stops at the
  exact bottom" issue (see the conversation around task 032 — was
  explicitly skipped).
- Reworking the infinite-scroll architecture / extracting it to a
  hook. Keep the diff narrow.
- Removing dedupe — it exists for a reason; the goal is to make the
  caller observe whether it produced growth.

## Open questions

- Is the right boundary for "no growth" (a) zero net-new after dedupe,
  or (b) fewer net-new than the requested page size? (b) is more
  conservative and would also trigger termination for partial-empty
  pages; (a) is the minimum to fix the loop.
- Where should the no-growth flag live? `App` state is simplest;
  passing it down as a prop avoids cross-component coupling. The
  alternative — recomputing in `Tracks` — duplicates the dedupe
  knowledge.
- Should `refreshTracks` clear the no-growth flag explicitly, or is it
  enough for `updateTracks(false)` to overwrite the relevant state in
  a way that naturally resets it? Likely the latter, but worth a
  scenario check.
