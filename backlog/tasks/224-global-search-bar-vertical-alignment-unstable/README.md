---
id: 224
title: Global search bar clear/spinner icon vertical alignment is unstable
effort: S
created: 2026-05-10
---

# Global search bar clear/spinner icon vertical alignment is unstable

## Why

The clear button (and the loading spinner) inside the top-bar
`GlobalSearchBar` is occasionally rendered a few pixels below the
vertical centre of the bar. The misalignment appears immediately
after navigating to another view and is "fixed" once the next
debounced search returns and the bar re-renders. The cart-filter
incarnation of the same component is not affected — only the top
bar instance.

Cosmetic but distracting because the icon visibly jumps when the
view re-renders.

## What

Make the icon's vertical position stable across mount, navigation,
and the search-result re-render. Specifically:

- The clear/spinner icon should be vertically centred in the
  `.search_bar_pills` (34 px tall) at all times, including the
  first paint after a view switch.
- The fix must hold for both `<Spinner>` and `<FontAwesomeIcon>`
  variants of the icon.
- No regression for the cart filter or the other `SearchBar`
  consumers (`Settings`, `CartDropDownButton`).

## Acceptance criteria

- [ ] After a fresh client-side navigation that mounts the
      `TopBar` `GlobalSearchBar`, the icon's centre is within ±1 px
      of the bar's vertical centre on first paint.
- [ ] After a search completes and the bar re-renders (loading →
      clear icon transition), the icon does not visibly shift.
- [ ] Resizing the window does not change the icon's position
      relative to the bar.
- [ ] Cart-filter `GlobalSearchBar` and the regular `SearchBar`
      uses are unaffected (visually unchanged).

## Code pointers

- `packages/front/src/SearchBarBase.js` — renders the
  `<span class="search-input-icon">` wrapper inside the bar after
  the input.
- `packages/front/src/SearchBar.css:1-20` —
  `.search-input-icon` (default 16 px tall, `align-self: center`)
  and `.search_bar_pills .search-input-icon` (height 34 px,
  `display: inline-flex; align-items: center`).
- `packages/front/src/TopBar.js:241` — `<GlobalSearchBar styles="top_bar" …>`
  inside `<div className="menu_search" style={{display:'flex', alignItems:'center'}}>`.
- `packages/front/src/TopBar.css:11,119,185-196,335` —
  `.menu_search` rules; the `flex: 1` declaration toggles on
  hover/focus and may be involved in the layout settling that
  "fixes" the misalignment after re-render.

## Out of scope

- Reworking the `SearchBarBase` API or splitting it into
  pill/non-pill variants.
- Changing the icon's set or the bar's height.
- Cart-filter alignment (already correct).

## Open questions

- Is the misalignment caused by the icon participating in a flex
  baseline before the bar's `height: 34px` has fully resolved?
  (`align-self: stretch` was tried earlier and did not help on
  first paint.)
- Does it reproduce in all browsers, or only some? Worth pinning
  down.
- Could it be specific to the conditional render path
  (`loading ? Spinner : hasContent ? ClearIcon : SearchIcon`)
  swapping element type at mount time? An empty wrapper +
  always-mounted children with display toggling might be more
  stable.
