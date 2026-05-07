---
id: 055
title: App icon, splash, launch screens (iOS + Android)
effort: S
created: 2026-05-07
---

# App icon, splash, launch screens (iOS + Android)

## Why

Make the app look like Fomo Player at install and first launch
instead of a bare Expo template.

## What

- App icon for iOS (1024×1024 master, all required sizes generated
  via Expo).
- App icon for Android (adaptive icon: foreground + background).
- Splash screen / launch screen aligned with the web favicon and the
  fomoplayer logo.
- Tinted icon for iOS 18+ (light / dark / tinted variants).

## Acceptance criteria

- [ ] App icon visible on home screen on iOS and Android matches the
      web favicon family.
- [ ] Splash screen shows on cold start until the navigator is ready;
      no flash of unstyled content.
- [ ] iOS adheres to current App Store icon requirements (no
      transparency, no rounded corners — Apple rounds them).
- [ ] Android adaptive icon survives the platform's icon-shape
      transforms without clipping.

## Code pointers

- `packages/back/public/favicon.svg` and `favicon.png` — current
  visual identity.
- `packages/front/public/` — current PWA manifest icon set.
