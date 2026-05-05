## Why

Iterating on the browser extension currently means re-running
`yarn build:chrome` (or its per-browser sibling) for every source
change and then reloading the unpacked extension. The repeat round-trip
slows small UI tweaks far more than necessary. There is already a
`yarn start` (driving `utils/webserver.js`) that runs `webpack-dev-server`
for one browser, but it is wired around a dev server that is overkill
for an MV3 extension that already gets reloaded by hand from the
browser's extension page. The production `utils/build.js` has no
watch mode at all.

We want a small `yarn watch` command that runs webpack in watch mode
against one or more browsers' build directories, with each rebuild
output clearly tagged so multi-target watching is followable. Safari
is excluded — loading an unpacked extension into Safari needs an Xcode
rebuild + re-sign + re-install cycle that a Node watcher cannot drive.

## What Changes

- Add `packages/browser-extension/utils/watch.js` that:
  - Reads a `BROWSERS` env var (comma-separated list, default
    `chrome`), validates each entry against `chrome` / `firefox`
    (rejecting `safari` with a clear error explaining why).
  - For each requested browser, loads `webpack.config.js` with
    `BROWSER=<browser>` (cache-busting `require.cache` so the same
    process can build N variants), sets `NODE_ENV=development` to
    pick the dev devtool, and tags the resulting config with
    `cfg.name = browser`.
  - Runs the array of configs through `webpack(configs).watch({},
    callback)` so a single `MultiCompiler` drives all targets, and
    prints a `[<browser>] …` prefix on every rebuild summary so the
    operator can tell which target each line belongs to.
  - Handles `SIGINT` / `SIGTERM` cleanly so Ctrl-C closes the watch.
- Add scripts to `packages/browser-extension/package.json`:
  - `watch`: defaults to `chrome`.
  - `watch:chrome`, `watch:firefox`: single-target convenience.
  - `watch:all`: both `chrome` and `firefox` together.
- Document the watch flow in `packages/browser-extension/README.md`
  in a new "Watch mode" subsection between "Build" and "Loading the
  extension during development".
- Leave `utils/webserver.js` and `yarn start` untouched — that
  pathway exists for the popup HMR flow and is orthogonal.

## Capabilities

### New Capabilities

- `extension-build-watcher`: A multi-target webpack watch entry-point
  for the browser extension that rebuilds on save into each browser's
  `build/<browser>/` directory.

### Modified Capabilities

_(none)_

## Impact

- Affected code:
  - `packages/browser-extension/utils/watch.js` (new).
  - `packages/browser-extension/package.json` (`scripts` entries).
  - `packages/browser-extension/README.md` (Watch mode subsection).
- No new runtime deps. `webpack` is already a devDependency in the
  extension package.
- No backend, worker, or front-end changes.
- Risk: misconfiguration on the operator's machine (e.g. `BROWSERS=safari`
  passed by accident) is caught at startup with a clear error.
