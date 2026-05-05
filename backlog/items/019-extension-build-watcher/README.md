---
id: 019
title: Watch mode for the browser-extension build
status: done
priority: P2
effort: M
created: 2026-05-04
depends-on: []
---

# Watch mode for the browser-extension build

## Why

Iterating on the extension currently requires re-running
`yarn build:chrome` (or per-browser equivalents) and then reloading the
unpacked extension. That round-trip is slow enough that small UI tweaks
take much longer than they should. A watcher that rebuilds on save would
cut the iteration loop dramatically.

`yarn start` already exists (it runs `utils/webserver.js`) but is wired
for a single browser at a time, and the production `utils/build.js`
script does not have a watch mode. We want a unified, ergonomic watch
command with browser selection.

## What

- Add a watch mode to the extension build pipeline that rebuilds on
  source change.
- Allow the user to choose which browser targets the watch covers
  (one, several, or all of `chrome` / `firefox`). Likely flag form:
  `yarn watch --browsers chrome,firefox` or
  `BROWSERS=chrome,firefox yarn watch`.
- Default to `chrome` if no browsers are specified (most-used target).
- Output should clearly label which target each rebuild belongs to so
  multi-target watching is followable.
- Webpack already supports `--watch`; preferred path is to drive the
  existing `utils/build.js` (or `webpack.config.js`) in watch mode rather
  than building a separate pipeline.

## Acceptance criteria

- [ ] `yarn watch` (or equivalent) starts a long-running process that
      rebuilds on source change, for the selected target(s), into the
      same `build/<browser>` directory the production build uses.
- [ ] Browser selection works for `chrome` and `firefox`, individually
      and combined.
- [ ] Per-rebuild log lines are tagged with the browser target.
- [ ] `package.json` gets a documented script entry; `README.md`
      mentions the watch command.

## Code pointers

- `packages/browser-extension/utils/build.js` — current production
  build entry (driven by `BROWSER` + `NODE_ENV`).
- `packages/browser-extension/utils/webserver.js` — existing dev-server
  flow (likely already runs webpack in watch under the hood, but only
  for one browser; reuse where it makes sense).
- `packages/browser-extension/webpack.config.js` — webpack config the
  builds share.
- `packages/browser-extension/package.json` — `scripts` section to add
  `watch`/`watch:chrome`/`watch:firefox` entries.

## Out of scope

- **Safari is excluded.** Loading an unpacked extension into Safari
  needs an Xcode project rebuild + re-sign + re-install cycle that
  cannot be reasonably driven from a Node watcher. Document this in
  the item, not as a TODO.
- Live-reload of the page or auto-reload of the extension after a
  rebuild — the user still hits the browser's "reload extension"
  button. (Possible follow-up, but explicitly not in scope here.)
- Production minification / safety hardening differences between
  watch and prod builds — watch should mirror dev-mode webpack.

## Open questions

- Does the existing `utils/webserver.js` already produce a `build/`
  output usable as an unpacked extension, or does it serve from memory
  only? If the latter, we either teach it to write-to-disk (likely via
  `write-file-webpack-plugin`, which is already a devDependency) or
  prefer a webpack-watch path through `utils/build.js`.
- How should we handle parallel rebuilds across browsers — a single
  `MultiCompiler` or N independent watchers? `MultiCompiler` is more
  efficient and gives one console; independent watchers are simpler.
