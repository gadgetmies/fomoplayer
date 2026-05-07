---
id: 081
title: Cart list screen + create cart
effort: S
created: 2026-05-07
---

# Cart list screen + create cart

## Why

The Carts tab needs a list of all carts as the entry point.
Creating a cart should be one tap away.

## What

- Carts tab root screen lists every cart owned by the user,
  default cart pinned first, with name + track count.
- "+ Create cart" button at the top opens a sheet with a name
  field; submitting creates the cart and navigates to its detail.
- Long-press → action sheet (rename, delete, set as default,
  share).
- Pull-to-refresh.

## Acceptance criteria

- [ ] List reflects the backend state on load and after every
      mutation.
- [ ] Default cart is visually distinct.
- [ ] Create cart flow ends on the new cart's detail screen.

## Code pointers

- `packages/back/routes/users/api.js:317` — list carts.
- `packages/back/routes/users/api.js:325` — create cart.
