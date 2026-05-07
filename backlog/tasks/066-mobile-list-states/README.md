---
id: 066
title: Pull-to-refresh + load-more + empty/error states
effort: S
created: 2026-05-07
---

# Pull-to-refresh + load-more + empty/error states

## Why

Lists need standard mobile affordances. Without these, the screen
feels like a webview.

## What

- Pull-to-refresh via `RefreshControl`, wired to TanStack Query
  `refetch`.
- Footer loader when the next page is fetching; tap-to-retry
  footer when the next page fails.
- Empty state per list (different copy for new / recent / heard).
- Error state with retry.

## Acceptance criteria

- [ ] Pulling down the list refetches and the platform spinner
      animates correctly (no jank on reset).
- [ ] Reaching the end of the list auto-loads the next page;
      manual retry button surfaces on next-page error.
- [ ] Empty state copy is idiomatic and useful (e.g. "No new
      tracks yet — try following more artists").
