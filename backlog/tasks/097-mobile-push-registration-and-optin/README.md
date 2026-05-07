---
id: 097
title: Mobile — push registration + opt-in screen
effort: M
created: 2026-05-07
---

# Mobile — push registration + opt-in screen

## Why

iOS will deny notifications silently if you ask without context.
The opt-in moment needs to explain the value first.

## What

- After login, surface an opt-in screen explaining "We'll let
  you know when new tracks match your saved searches" with a
  "Turn on notifications" CTA + "Maybe later" skip.
- Re-surfaceable from Settings → Notifications.
- Use `expo-notifications` to request permission; on grant,
  fetch the device token and POST it to the backend (task 096).
- On app uninstall / token rotation, register the new token on
  next launch and stale ones eventually expire on the backend.

## Acceptance criteria

- [ ] Opt-in flow surfaces only once per launch session
      automatically; reachable from Settings any time.
- [ ] On permission grant, token is registered with the
      backend and visible in Settings → Notifications.
- [ ] On permission denial, the app explains how to enable it
      from system Settings.
