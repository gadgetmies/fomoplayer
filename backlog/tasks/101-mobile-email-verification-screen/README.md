---
id: 101
title: Email verification result screen
effort: S
created: 2026-05-07
---

# Email verification result screen

## Why

Task 064 wires the deep link; this task delivers the screen the
user lands on after tapping it.

## What

- Screen states: success (verified now), already-verified,
  invalid / expired code.
- Each state has a clear message and a primary CTA (Continue,
  Sign in, Request new link).
- Reachable in-app from Settings → Account when the email is
  unverified.

## Acceptance criteria

- [ ] Each state matches the backend response.
- [ ] CTAs route correctly (success → Tracks; sign-in → login;
      request new link → POSTs the request endpoint).
