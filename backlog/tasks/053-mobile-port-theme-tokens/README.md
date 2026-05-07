---
id: 053
title: Port theme tokens to React Native
effort: S
created: 2026-05-07
---

# Port theme tokens to React Native

## Why

Visual consistency with the web app + browser extension (which already
shares the `fomoplayer-theme-tokens` capability). Avoid hand-rolled
colour and spacing constants in mobile screens.

## What

- Export theme tokens (colours, spacing, font sizes, font families)
  from `fomoplayer_shared` (or the existing tokens package) in a form
  RN can consume.
- Provide a `useTheme()` hook (or context) that returns typed tokens.
- Match dark / light mode handling to platform `Appearance` API.

## Acceptance criteria

- [ ] All placeholder screens render using tokens — no inline hex
      colours or magic numbers in style code.
- [ ] Switching system dark / light mode flips the app's appearance
      without restart.
- [ ] Tokens stay in sync with the web app — if a token changes in
      the shared module, both surfaces update.

## Code pointers

- `openspec/specs/fomoplayer-theme-tokens/` — existing capability.
- `packages/front/src/theme.css` and `constants.css` — current token
  values.
- `packages/browser-extension/` — reference for how the extension
  consumes the same tokens.
