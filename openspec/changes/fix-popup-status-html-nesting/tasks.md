## 1. Implementation

- [x] 1.1 In `packages/browser-extension/src/js/popup/Status.jsx`, replace the outer `<p>` wrapper at lines 12 and 22 with `<div>`.
- [x] 1.2 Remove the now-vestigial `<br />` between the message and the `<Progress>` element (line 15).

## 2. Verification

- [x] 2.1 Rebuild the extension and load the unpacked build in Chrome (`npm run build` from `packages/browser-extension/` or the usual dev watcher).
- [x] 2.2 Open the extension popup, trigger a Bandcamp Feed sync, and confirm the browser console contains no `validateDOMNesting` warning attributable to `Status` while the operation runs.
- [x] 2.3 Confirm the rendered DOM of the mounted `Status` shows the heading, message, and progress bar as direct children of a single `<div>`, with no preceding empty `<p>`.
- [x] 2.4 Compare the on-screen vertical rhythm (heading → message → progress bar) against the previous build; confirm no visible layout shift or missing whitespace.

## 3. Wrap-up

- [x] 3.1 Move the backlog symlink: `mv backlog/in-progress/em-029-popup-status-invalid-html-nesting backlog/done/029-popup-status-invalid-html-nesting` (strip the ordering prefix).
- [ ] 3.2 Stage the commit, request user verification, and on the user's go-ahead create one commit covering the Status.jsx fix, the backlog move, and the openspec change directory.
- [ ] 3.3 Archive the openspec change with `/opsx:archive fix-popup-status-html-nesting` once the commit lands.
