---
id: 100
title: Sign-up + waiting-list screen
effort: M
created: 2026-05-07
---

# Sign-up + waiting-list screen

## Why

When sign-up is closed, the web app shows a waiting-list form.
Mobile needs the same fork — and a smooth path back to login
when the user already has an account.

## What

- "Sign up" entry point on the login screen.
- On open, fetch `/api/sign-up-available`.
- Open: show a sign-up form (currently the same as login —
  Google OAuth — but leave room for adding email-based sign-up
  later).
- Closed: show a waiting-list form
  (`POST /api/join-waiting-list`).
- Confirmation screen on submit.

## Acceptance criteria

- [ ] Open / closed states render the right form.
- [ ] Waiting-list submission shows a clear confirmation.
- [ ] Errors (network, validation) surface inline.

## Code pointers

- `packages/back/routes/public.js:50` — sign-up availability.
- `packages/back/routes/public.js:58` — join waiting list.
