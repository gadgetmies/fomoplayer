---
id: 095
title: Account screen
effort: S
created: 2026-05-07
---

# Account screen

## Why

A focused screen for the user's identity, biometric preferences,
sign-out, and account deletion.

## What

- Show email + sign-up status.
- Update email field (writes via `/api/settings`).
- Biometric-on-resume toggle (story 041 task 062 implements the
  underlying behaviour).
- Sign out button.
- Delete account button — confirms via two-step alert; clears
  local state on success.

## Acceptance criteria

- [ ] Email update persists and survives cold start.
- [ ] Biometric toggle changes effective resume behaviour.
- [ ] Sign out and delete both clear `expo-secure-store` and
      route to login.

## Code pointers

- `packages/back/routes/users/api.js:408` — get settings.
- `packages/back/routes/users/api.js:413` — update settings
  (email).
