---
id: 062
title: Secure session persistence + biometric resume
effort: M
created: 2026-05-07
---

# Secure session persistence + biometric resume

## Why

Re-authenticating on every cold start is unusable. Persisting
credentials is fine if they're stored in the platform keychain and
optionally gated by biometrics on resume.

## What

- Store the bearer / session via `expo-secure-store` (Keychain on
  iOS, Keystore on Android).
- On app resume after ≥ N minutes (configurable; default 15),
  prompt for biometric unlock via
  `expo-local-authentication` before continuing. Fallback to
  device passcode if biometrics unavailable.
- Settings → Account toggle to disable biometric gating entirely.
- On uninstall, credentials are gone (no iCloud Keychain spillover
  for shared bearer secrets — verify per platform behaviour).

## Acceptance criteria

- [ ] After login, killing and reopening the app skips the login
      screen and lands authenticated.
- [ ] After backgrounding for > N minutes, a biometric prompt
      appears before any UI is shown.
- [ ] Disabling the biometric toggle in Settings makes resume
      instant.
- [ ] No credentials in `AsyncStorage` or any non-secure storage.

## Code pointers

- Story 047 task 095 — Account screen owns the biometric toggle.
