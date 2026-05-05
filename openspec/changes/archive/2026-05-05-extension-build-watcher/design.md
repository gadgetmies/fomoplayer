## Context

The extension's webpack pipeline ships three entry points today:

- `utils/build.js` — production build for one browser (driven by
  `BROWSER` + `NODE_ENV`); runs `webpack(config)` once and exits.
- `utils/webserver.js` — `webpack-dev-server` with HMR injection,
  one browser at a time, primarily for the popup React app.
- `webpack.config.js` — single configuration object, `module.exports`,
  which means requiring it twice in the same process returns the
  same object (Node's module cache). The config reads
  `process.env.BROWSER` at require time and bakes it into output
  paths and the manifest overlay merge.

For watch mode we want `webpack` itself in long-running watch mode —
no dev server, no HMR injection, just rebuilds on save into each
browser's `build/<browser>/` directory. Webpack supports passing an
array of configs to `webpack(configs)` to drive a `MultiCompiler`,
which is the cleanest fit for "watch chrome and firefox at the same
time."

## Goals / Non-Goals

**Goals:**

- One `yarn watch` command that rebuilds on source change, default
  target `chrome`, with clear browser selection via `BROWSERS=`.
- Per-rebuild log lines tagged with the browser target so the
  operator can read a multi-target watch.
- No regression to the existing `yarn build:*` and `yarn start`
  pathways.

**Non-Goals:**

- Auto-reloading the extension after a rebuild. The user still
  clicks "reload" on their browser's extension page (or
  `web-ext run --source-dir=build/firefox` for Firefox). A
  follow-up could wire in
  [`webpack-extension-reloader`](https://github.com/rubenspgcavalcante/webpack-extension-reloader)
  or a similar tool, but that's a separate item.
- Live-reloading the active web page. The extension's content scripts
  re-inject on extension reload; per-page reload is the user's job.
- Adding HMR / `webpack-dev-server` to the watch path. HMR doesn't
  fit MV3 service workers cleanly and is overkill for the iteration
  loop we're trying to shorten.
- Watching Safari. Loading an unpacked Safari Web Extension needs
  `xcrun safari-web-extension-converter` followed by an Xcode
  rebuild + re-sign + re-install cycle that a Node watcher cannot
  drive. Reject `BROWSERS=safari` at startup with a clear message
  pointing at the per-browser distribution table in the README.

## Decisions

### Decision: One `MultiCompiler` driven by an array of configs

**Rationale:** Webpack's `MultiCompiler` watches all targets with a
single change-detection pass and emits one stats object per
configuration on each rebuild, which is exactly what we want for
log tagging. It avoids spinning up N independent watchers (each
walking the file system separately) and keeps the operator with
one foreground process to Ctrl-C.

**Alternatives considered:**

- **N independent watchers / N child processes.** Simpler config
  loading but spawns N file-watchers and N webpack instances, and
  multiplies the log-output-prefixing complexity.
- **`webpack-cli --watch` from a shell script.** Doesn't give a
  clean way to tag per-target output and bakes the config into the
  CLI invocation, making the script harder to read.

### Decision: Cache-bust `require.cache` between config requires rather than refactor `webpack.config.js`

**Rationale:** `webpack.config.js` reads `BROWSER` at require time
and exports a single object. Refactoring it to a factory
(`module.exports = (browser) => {...}`) would touch
`utils/build.js` and `utils/webserver.js` too, which is a wider
diff than this item warrants. Cache-busting is a single-line dance
in `utils/watch.js` that has no effect on the existing build /
dev-server flows.

```js
delete require.cache[require.resolve('../webpack.config.js')]
process.env.BROWSER = browser
const cfg = require('../webpack.config.js')
```

If a future item refactors the config to a factory, the watch
script collapses to a one-line map without losing functionality.

### Decision: Default to `chrome`, accept `BROWSERS=chrome,firefox`

**Rationale:** Chrome is the most-used dev target and matches the
existing `BROWSER` default in `webpack.config.js`. Comma-separated
input matches how operators typically express "these targets" in
shell scripts. Whitespace is trimmed; empty entries are filtered.
Validation rejects unknown / Safari entries with a one-line error
that names the supported set.

### Decision: Set `NODE_ENV=development` and tag `cfg.name = browser`

**Rationale:** `NODE_ENV=development` selects the cheap source-map
devtool already configured in `webpack.config.js` (the production
build keeps no devtool). `cfg.name` is the canonical webpack hook
for `MultiCompiler` to tag each child compiler's stats; the watch
script reads `stats.compilation.name` (or each child's
`stats.toJson({ all: false }).name`) when printing rebuild
summaries.

## Risks / Trade-offs

- **`require.cache` busting feels fragile.** It is — but the
  blast radius is one file (`webpack.config.js`) and the entire
  watch script is ~50 lines. A future config-factory refactor
  removes the dance entirely.
- **`MultiCompiler` shares a single watching loop, so a noisy
  rebuild on one target slightly delays the other.** In practice,
  both targets share the same source tree, so any one save
  triggers both rebuilds anyway; the cost is the same as the
  serial-rebuild alternative.
- **Operators may forget that watch ≠ auto-reload.** The README
  subsection calls this out explicitly so the expectation is
  set.

## Migration Plan

Single-step addition; no migration. Roll out with the next merge.
Rollback = revert.

## Open Questions

_(none — the existing webpack pipeline is well-understood and the
tradeoffs are captured above.)_
