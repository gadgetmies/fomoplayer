---
id: 079
title: Recent + saved searches
effort: S
created: 2026-05-07
---

# Recent + saved searches

## Why

Users repeat the same searches. Recent searches save typing; saved
searches give a one-tap way back to the queries that matter most
and become the entry point for push-notification subscriptions.

## What

- Recent searches stored in `AsyncStorage` (last ~20). Shown as
  taps on an empty Search screen.
- Saved searches persisted on the backend via the existing
  notifications model (saved-search ↔ notification subscription).
- Save / unsave button on the Search screen header.
- Saved searches list in Settings → Notifications mirrors this
  store.

## Acceptance criteria

- [ ] Recent searches survive app restarts.
- [ ] Saving a search adds it to the saved list and the
      Notifications screen.
- [ ] Tapping a recent or saved search re-runs it.

## Code pointers

- `packages/back/routes/users/api.js:399` — notifications endpoint.
- Story 048 — push-notification subscriptions ride saved searches.
