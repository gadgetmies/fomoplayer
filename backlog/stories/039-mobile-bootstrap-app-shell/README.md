# Story 039 — Mobile project bootstrap & app shell

Stand up the mobile package, the build pipeline, and an app shell deep
enough that subsequent stories can drop their screens in without further
plumbing work.

## User-facing change

A user can install the mobile app on iOS or Android via internal
distribution, launch it, see a Fomo Player splash + branded shell with a
bottom-tab navigator (Tracks · Search · Carts · Settings) and theming
that matches the web app. None of the tabs do real work yet beyond
"Hello world", but the shell is real and ships.

## Why

Without a working RN/Expo workspace, build pipeline, and shared shell,
every subsequent story would have to re-prove the platform basics.
Doing this once up front lets every later story be a pure feature
delivery.

## "Done" looks like

- `packages/mobile/` is a yarn-workspace member with TypeScript + lint
  + format aligned with the rest of the monorepo.
- An iOS build runs on simulator and a real device via EAS Build, and
  an Android build runs on an emulator and a physical device.
- Bottom-tab navigator with 4 tabs and placeholder screens is wired up.
- App icon + splash + theme tokens (ported from the existing
  `fomoplayer-theme-tokens` capability) are visible.
- CI runs typecheck + lint + tests on every PR touching
  `packages/mobile/`.
- The build fails loudly when `EXPO_PUBLIC_API_URL` is unset — no
  silent fallback to a literal hostname (per the project's config
  policy).

## Tasks

- [051 — Create `packages/mobile` Expo workspace](../../tasks/051-mobile-create-expo-workspace)
- [052 — Bottom-tab navigator skeleton](../../tasks/052-mobile-bottom-tab-navigator)
- [053 — Port theme tokens to React Native](../../tasks/053-mobile-port-theme-tokens)
- [054 — CI for mobile (typecheck + lint + test + EAS smoke)](../../tasks/054-mobile-ci-pipeline)
- [055 — App icon, splash, launch screens (iOS + Android)](../../tasks/055-mobile-icon-splash-launch)
- [056 — Build-time API URL injection (no hardcoded hosts)](../../tasks/056-mobile-api-url-injection)
