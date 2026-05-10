## Working notes

- Reported during work on the inline pill search (around the cart
  filter / global search rework). User confirmed cart filter is
  fine; only the global search top-bar instance jumps.
- Several positioning approaches have been tried: absolute outside
  the bar, sticky inside the bar with `align-self: stretch`,
  sticky inside the bar with explicit `height: 34px` and
  `align-self: center`. The current state (explicit height, flex
  centring) is correct *after* re-render but not on first paint
  in the top bar.
- Hypothesis: `.menu_search` toggling `flex: 1` on
  `:hover` / `:focus-within` causes a width recompute on first
  interaction; whatever sub-pixel layout the icon picks up before
  that snaps back to centre after the recompute. Worth verifying
  with DevTools "show layout" before changing CSS.
