# Story 041 — Authentication & session

Native Google login on iOS and Android, persistent session that survives
backgrounding and app restarts, deep-link handling for email
verification, and a clean logout / session-expired path.

## User-facing change

A user opens the mobile app for the first time, taps "Sign in with
Google", completes the OAuth flow in the system browser
(`ASWebAuthenticationSession` on iOS, Custom Tabs on Android), and lands
in the Tracks tab authenticated. On every subsequent launch they go
straight to the app — no second login. Tapping "Log out" returns them
to the login screen. Receiving an email-verification link from the
backend opens the app and confirms the address.

## Why

Login is the gate. It also sets the contract for every subsequent API
call (the session cookie / token shape must work cross-app boundary).
Until this is right, no other story can run end-to-end against the real
backend.

## "Done" looks like

- Login on iOS and Android via `expo-auth-session` (or equivalent),
  hitting an existing or new backend handoff endpoint that mirrors the
  CLI / extension flows.
- Session credentials are stored in `expo-secure-store`; the app
  resumes authenticated after a restart without prompting again.
- Backgrounding ≥ a configurable interval prompts a biometric unlock
  (`expo-local-authentication`); user-disable-able in Settings.
- A 401 anywhere in the app drops the user back to the login screen
  with a clear "session expired" message; the queued action is
  preserved when feasible (replay after re-auth).
- Logout clears the secure store, the API session, and the local
  caches.
- `fomoplayer://verify-email/<code>` deep link opens the verification
  result screen.

## Tasks

- [060 — Native OIDC flow against `/auth/login/google`](../../tasks/060-mobile-native-oidc-flow)
- [061 — Backend mobile handoff endpoints](../../tasks/061-backend-mobile-handoff-endpoints)
- [062 — Secure session persistence + biometric resume](../../tasks/062-mobile-session-persistence)
- [063 — 401 interception + logout flow](../../tasks/063-mobile-401-and-logout)
- [064 — Email verification deep link](../../tasks/064-mobile-email-verification-deep-link)
