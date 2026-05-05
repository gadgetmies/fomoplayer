## 1. Replace probeLoggedIn with the menubar-link check

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp.js`,
      rewrite `probeLoggedIn` to return the negation of
      `document.querySelector('a[href*="/login?from=menubar"]')`.
- [x] 1.2 Drop the `.userpic` DOM check entirely and the `#pagedata`
      `data-blob` parsing helper — neither is consulted any more.
- [x] 1.3 Confirm the `bandcamp:probe` handler still returns
      `{ loggedIn, hasPlayables, onSubdomain }` with the same key set
      and same booleans.

## 2. Polish the popup heading

- [x] 2.1 In `packages/browser-extension/src/js/popup/BandcampPanel.jsx`,
      render the Sync heading as `Sync` when `loggedIn` is true and
      `Sync (Requires login)` otherwise.
- [x] 2.2 Confirm `componentDidMount` already issues the probe on
      every popup mount; no caching change needed.

## 3. Build and verification

- [x] 3.1 Run the browser-extension build and confirm it succeeds.
- [x] 3.2 Ask the user to load the rebuilt extension and verify the
      acceptance criteria from
      `backlog/items/020-bandcamp-login-detection-bug/README.md`:
      sync buttons enable on a logged-in homepage / release / artist /
      fan-dashboard / discover tab, stay disabled when logged out, and
      reflect the new state on the next popup open after logging in
      without a tab reload. Also verify the Sync heading drops the
      "(Requires login)" hint when logged in. (User confirmed
      "verified" 2026-05-05.)

## 4. Wrap up

- [x] 4.1 After explicit user verification, commit the change with all
      relevant files (content script, popup tweak, the OpenSpec
      change).
- [x] 4.2 Archive the OpenSpec change via `/opsx:archive`.
- [x] 4.3 Move the backlog item out of "Todo" into "Done" in
      `backlog/INDEX.md`.
