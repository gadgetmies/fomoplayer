---
id: 083
title: Native share sheet + universal/app links
effort: M
created: 2026-05-07
---

# Native share sheet + universal/app links

## Why

Sharing a cart with a friend should feel native. The link should
also re-open the app on the recipient's phone if they have it
installed.

## What

- Share button in Cart detail header opens the native share sheet
  with a URL (`https://<frontend>/carts/<uuid>`).
- iOS Universal Links + Android App Links so the same URL opens
  the installed app and routes to the cart.
- `apple-app-site-association` and `assetlinks.json` served from
  the frontend host; coordinate with `packages/front/` deployment
  config (and the project's "no deployment domains in source"
  rule — host derived at build time).
- Custom scheme `fomoplayer://carts/<uuid>` as a fallback for
  non-HTTPS contexts.

## Acceptance criteria

- [ ] Tapping a shared link with the app installed opens the app
      directly into the cart screen.
- [ ] Without the app, the link opens the public cart page on
      the web.
- [ ] Native share sheet preview shows cart name + track count.

## Out of scope

- Public cart page rendering (task 084).
