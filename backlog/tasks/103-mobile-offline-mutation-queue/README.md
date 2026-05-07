---
id: 103
title: Offline mutation queue + replay-on-reconnect
effort: L
created: 2026-05-07
---

# Offline mutation queue + replay-on-reconnect

## Why

Music listening happens on subways, on planes, on shaky
connections. The user shouldn't watch their swipes fail.

## What

- Persistent mutation queue (`@tanstack/react-query`'s built-in
  mutation persistence + a custom serialiser for our mutations,
  or a small bespoke queue stored in `expo-sqlite` /
  `AsyncStorage`).
- Queue captures: heard / unheard, add-to-cart / remove-from-cart,
  follow / unfollow, ignore / un-ignore, star / unstar,
  mark-purchased.
- Optimistic UI fires immediately; mutation enqueues; replays on
  reconnect.
- On replay failure (4xx other than 401), the action is rolled
  back with a toast explaining what happened.
- 401 reschedules the action behind re-auth (story 041).

## Acceptance criteria

- [ ] Going offline mid-swipe queues the mutation; UI does not
      revert.
- [ ] Coming back online flushes the queue in order.
- [ ] Killing the app while offline preserves the queue across
      restart.
- [ ] Conflict resolution (e.g. user marks heard offline, then
      another client does the same) is idempotent.
