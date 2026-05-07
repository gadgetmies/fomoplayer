---
id: 056
title: Build-time API URL injection (no hardcoded hosts)
effort: S
created: 2026-05-07
---

# Build-time API URL injection (no hardcoded hosts)

## Why

`CLAUDE.md` mandates that no deployment domains live in source. Mobile
must read its API URL from a build-time env var, fail loudly when
unset, and never silently fall back to a literal — the extension build
already learned this lesson the hard way.

## What

- Read `EXPO_PUBLIC_API_URL` (and `EXPO_PUBLIC_FRONTEND_URL` if
  needed) at build time via `expo-constants`.
- The build script aborts with a clear error when these are unset —
  no defaulting to `localhost` or any literal host.
- Expose them through a small `config.ts` module mirroring
  `packages/front/src/config.js`'s shape so the rest of the app reads
  one source.
- Document required env per environment (local dev, EAS preview,
  production) in `packages/mobile/README.md`.

## Acceptance criteria

- [ ] Building without `EXPO_PUBLIC_API_URL` set fails with a clear
      message naming the missing variable.
- [ ] No string literal containing a deployment domain (e.g.
      `fomoplayer.com`, `up.railway.app`) exists in
      `packages/mobile/src/`.
- [ ] All API requests in the mobile app go through the config module.
- [ ] PR preview builds receive their preview API URL via EAS env
      and the app talks to it (verifies cross-environment config).

## Code pointers

- `packages/browser-extension/` build setup — reference for the
  fail-loudly pattern.
- `CLAUDE.md` (project) — "Configuration policy".
