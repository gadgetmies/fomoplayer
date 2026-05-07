---
id: 092
title: Notifications screen
effort: M
created: 2026-05-07
---

# Notifications screen

## Why

Users need to manage their saved-search subscriptions (and the
audio-sample notifications) from one place.

## What

- List of saved searches with subscribe/unsubscribe toggle and
  delete (swipe-left).
- Audio-sample notifications sub-section: list of registered
  samples, add / delete.
- Toggle for native push (delegates to platform permission
  state; deep-links to Settings if denied).
- Email notification toggle.

## Acceptance criteria

- [ ] Subscriptions reflect backend state on load and after
      mutations.
- [ ] Audio-sample upload / delete round-trips through
      `/api/notifications/audio-samples`.
- [ ] Push permission state surfaces accurately (granted /
      denied / never asked).

## Code pointers

- `packages/back/routes/users/api.js:399` — list notifications.
- `packages/back/routes/users/api.js:403` — patch.
- `packages/back/routes/users/api.js:442` — list audio samples.
- `packages/back/routes/users/api.js:447` — add audio sample.
- `packages/back/routes/users/api.js:505` — delete audio sample.
