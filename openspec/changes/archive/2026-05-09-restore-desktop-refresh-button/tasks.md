## 1. Non-touch detection

- [x] 1.1 Add a small helper or inline `window.matchMedia('(hover: hover) and (pointer: fine)')` lookup in `packages/front/src/Tracks.js`, with a fallback to `true` (show the button) when `matchMedia` is unavailable or returns no result.
- [x] 1.2 Track the result in component state (e.g. `showDesktopRefresh`), initialised from the media query in the constructor.
- [x] 1.3 Subscribe to the `MediaQueryList` `change` event in `componentDidMount` to update the state if the user docks / undocks an input device, and unsubscribe in `componentWillUnmount`.

## 2. Refresh button render

- [x] 2.1 Re-add a `<tfoot>` row in `Tracks.js` for the `new` / `recent` / `heard` panels (mirroring the layout removed in commit `78fda47d`), gated by `showDesktopRefresh && !this.props.preview && ['new','recent','heard'].includes(this.props.listState)`.
- [x] 2.2 Render a `SpinnerButton` inside that row with `size={isMobile ? 'small' : 'large'}`, `loading={this.state.updatingTracks}`, `disabled={this.state.updatingTracks}`, label `Refresh`, and `onClick={() => this.refreshTracks()}`.
- [x] 2.3 Leave the existing carts pagination branch in `<tfoot>` unchanged; ensure the conditions don't double-render a foot row when both the refresh button and cart paging would be eligible (they aren't — `carts` is excluded from refresh — but verify by reading the surrounding JSX).

## 3. Manual verification

- [x] 3.1 Start the front-end dev server and load the `new` panel in a desktop browser without touch emulation; confirm the refresh button is visible, clicking it calls `onUpdateTracksClicked` and shows the spinner.
- [x] 3.2 Repeat on the `recent` and `heard` panels; confirm the button appears on both and is absent on the `carts` panel.
- [x] 3.3 With the desktop browser still open, enable the device toolbar / touch emulation (or open the page on a touch device) and confirm pull-to-refresh still works on the same panels.
- [x] 3.4 Trigger a refresh failure (e.g. by going offline) from the desktop button and confirm the button re-enables after the failure resolves.

## 4. Wrap-up

- [x] 4.1 Update `backlog/tasks/032-restore-desktop-refresh-button/notes.md` with the implementation summary and any rejected approaches encountered during the work.
- [x] 4.2 Move `backlog/in-progress/bm-032-restore-desktop-refresh-button` to `backlog/validated/` (skipping `to-be-verified/` because user verified directly in-conversation; the `bm-` ordering prefix stays, per the backlog README).

## 5. Concurrency follow-up (added during verification)

- [x] 5.1 Disable the desktop Refresh button while `props.loadingMore` is true so a manual refresh cannot race with an in-flight `loadMoreTracks` (`updateTracks(true)` and `updateTracks(false)` would otherwise both call `setState` with the last-resolver winning).
