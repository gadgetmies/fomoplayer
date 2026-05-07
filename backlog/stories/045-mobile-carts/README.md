# Story 045 — Carts

The Carts tab: a list of carts (default + custom), cart detail with
swipe-to-remove and mark-purchased, native share-sheet for cart URLs,
public read-only cart screens accessible by deep-link without auth, and
the import-playlist flow.

## User-facing change

A user can open the Carts tab, see all their carts (default first), tap
a cart to view its tracks, swipe a track row to remove it, mark tracks
as purchased, share a cart with a friend via the native share sheet
(message, email, etc.), and create new carts. A friend tapping a shared
cart link opens the app (or web fallback) into a read-only public cart
view without needing to log in.

## Why

Sharing carts is core to the social side of the product. The web
shareable URL works but doesn't open the app on tap; the native share
sheet + deep links make the flow feel intentional on mobile.

## "Done" looks like

- Cart list screen with create-cart sheet (sets default flag if
  applicable).
- Cart detail shows tracks with the same row component; swipe-to-remove
  is optimistic with undo.
- Share sheet emits a deep-linkable URL
  (`https://<frontend>/carts/<uuid>` with `fomoplayer://carts/<uuid>`
  iOS Universal Link / Android App Link).
- Public cart screen renders without an authenticated session (mirrors
  the web `/api/public/carts/:uuid` route) and shows a clear "log in
  to copy this cart" CTA.
- Mark-purchased + import-playlist flows from the web are reachable.

## Tasks

- [081 — Cart list screen + create cart](../../tasks/081-mobile-cart-list)
- [082 — Cart detail + swipe-to-remove + mark-purchased](../../tasks/082-mobile-cart-detail)
- [083 — Native share sheet + universal/app links](../../tasks/083-mobile-cart-share-deep-links)
- [084 — Public cart screen (no auth)](../../tasks/084-mobile-public-cart-screen)
- [085 — Import playlist flow](../../tasks/085-mobile-import-playlist)
