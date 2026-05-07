---
id: 051
title: Create packages/mobile Expo workspace
effort: M
created: 2026-05-07
---

# Create `packages/mobile` Expo workspace

## Why

Stand up the React Native + Expo project that every later mobile story
will live inside. Without this, no mobile work can run.

## What

- Create `packages/mobile/` as a yarn workspace (consistent with
  `packages/back`, `packages/front`, etc.).
- Use Expo SDK current LTS, TypeScript, ESLint + Prettier configs
  matching the rest of the monorepo.
- iOS + Android build targets configured; runs on simulator and on a
  physical device via Expo Go (or dev client) for local development.
- Project README covering local dev (`yarn workspace mobile start`),
  device QR pairing, and the EAS Build entry point.

## Acceptance criteria

- [ ] `yarn workspaces info` lists `mobile` as a workspace.
- [ ] `yarn workspace mobile start` boots Metro and the app loads on
      iOS simulator and Android emulator.
- [ ] `yarn workspace mobile typecheck` and `lint` pass on a freshly
      cloned repo.
- [ ] No deployment domains in source — API URL is read from a build
      env var (handled in task 056, but the placeholder must already
      go through env, not a literal).

## Code pointers

- `package.json` — add `mobile` to the `workspaces` array.
- `packages/front/package.json` and `packages/back/package.json` —
  reference for shared lint / format / TS settings.

## Out of scope

- Any actual screens beyond a placeholder root (story 039 task 052
  delivers the navigator).
- App icon and splash (task 055).
- CI (task 054).
