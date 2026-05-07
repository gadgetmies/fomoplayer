---
id: 064
title: Email verification deep link
effort: S
created: 2026-05-07
---

# Email verification deep link

## Why

The backend email-verification flow already exists
(`/api/verify-email/:verificationCode`). Mobile users tapping the
link from email should land in the app, not the website.

## What

- Configure iOS Universal Links / Android App Links so
  `https://<frontend>/verify-email/<code>` opens the app when
  installed.
- App route handler calls the backend, surfaces the result on a
  dedicated screen (story 049 task 101 owns the screen UI).
- Falls back to the web flow when the app isn't installed
  (default platform behaviour).

## Acceptance criteria

- [ ] Tapping a verification link from a phone with the app
      installed opens the app and confirms the address.
- [ ] Tapping the same link without the app installed continues to
      the web flow.
- [ ] Verification result (success / already verified / invalid)
      maps to the corresponding screen state.

## Code pointers

- `packages/back/routes/public.js:38` — current
  `/verify-email/:verificationCode` handler.
