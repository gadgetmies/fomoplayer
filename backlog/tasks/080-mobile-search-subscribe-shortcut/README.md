---
id: 080
title: Notification subscribe shortcut from search
effort: S
created: 2026-05-07
---

# Notification subscribe shortcut from search

## Why

Saving a search and getting a push when new tracks match it is the
core "personal radar" use case. A one-tap entry point on the Search
screen is the most ergonomic way to opt into it.

## What

- Bell-icon button in the Search screen header toggles a
  push-notification subscription for the current query (story 048
  owns the actual delivery).
- Visual state mirrors backend (subscribed / not).
- Toast confirmation on toggle.
- If the user has not granted notification permission, opens the
  opt-in flow first (task 097).

## Acceptance criteria

- [ ] Subscribe / unsubscribe round-trips through the backend
      notifications model.
- [ ] State stays in sync with Settings → Notifications.
- [ ] Tapping subscribe without permission triggers the opt-in
      sheet rather than silently failing.
