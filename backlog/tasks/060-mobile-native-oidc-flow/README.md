---
id: 060
title: Native OIDC flow against `/auth/login/google`
effort: L
created: 2026-05-07
---

# Native OIDC flow against `/auth/login/google`

## Why

The mobile app needs Google OAuth to feel native — system browser
sheet, no third-party page, no flicker. Reusing the existing OIDC
infrastructure (and the recent stateless state-store work) avoids
duplicating auth logic.

## What

- Use `expo-auth-session` (PKCE) on iOS and Android.
- Hit a mobile-specific consume endpoint on the backend (added in
  task 061), mirroring the extension flow's
  `/login/extension/google` and `/extension/token` endpoints.
- Custom scheme `fomoplayer://auth/return` for redirect; iOS
  Universal Links / Android App Links if the redirect needs HTTPS.
- On success: receive a token, exchange it for a session cookie /
  bearer token, hand off to task 062 for storage.

## Acceptance criteria

- [ ] First-launch login on iOS opens
      `ASWebAuthenticationSession`, completes Google OAuth, returns
      to the app with a valid session.
- [ ] Same on Android (Custom Tabs).
- [ ] Cancelling the system browser dismisses cleanly with no error
      state in the app.
- [ ] PKCE verifier never leaves the device.
- [ ] Works against PR preview backends (the mobile flow is a handoff
      consumer when the backend is a consumer — same architecture as
      the existing PR preview handoff).

## Code pointers

- `packages/back/routes/auth.js:301` — extension `/login/extension`
  flow as the closest existing analog.
- `packages/back/routes/auth.js:419` — extension token exchange.
- `openspec/specs/pr-preview-auth-handoff/spec.md` — the existing
  handoff capability the mobile flow extends.

## Out of scope

- Backend endpoint implementation (task 061).
- Persisting the resulting credentials (task 062).
