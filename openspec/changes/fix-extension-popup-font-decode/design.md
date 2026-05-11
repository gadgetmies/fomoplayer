## Context

`packages/browser-extension/webpack.config.js` registers two
pipelines for binary assets including `.woff2`:

1. An explicit rule using `file-loader` with
   `options: { name: '[name].[ext]' }` (lines 81–87).
2. Webpack 5's built-in asset module handling, which is the
   default for any URL reference that isn't explicitly matched by
   a rule with a recognised `type`.

`typeface-lato` ships CSS with `url('../fonts/lato-latin-100.woff2')`
declarations. css-loader processes those `url()`s and resolves
them through webpack's module graph. Because css-loader's
url-handling does not always route through the `file-loader` rule
the same way a plain `import` would, the resolution ends up going
through asset-modules. The resulting emitted file is a JavaScript
shim — `export default _…` — saved under a content-hashed name
(e.g. `45390e2f480aa2e30c0b.woff2`). file-loader meanwhile *also*
emits the same source file as `lato-latin-100.woff2` with the
binary content intact. The CSS references the hashed name, so the
browser receives the JS shim and fails to decode it as a font.

This pattern is documented in webpack 5's migration guide:
file-loader is deprecated in favour of asset modules
(`type: 'asset/resource'`), and mixing both for the same
extension creates exactly this kind of double-pipeline bug.

The extension popup and options pages both import
`typeface-lato`, so both have the broken font reference. Other
extension pages (auth callback, audio player, content scripts)
do not import typeface-lato today, but they share the same
webpack config.

## Goals / Non-Goals

**Goals:**
- Eliminate the `Failed to decode downloaded font` console
  errors on popup and options page open.
- Make the Lato typeface actually render on those pages.
- Make the font-emission durable: future rebuilds must not
  regress to the JS-shim output silently.
- Keep the fix minimal — webpack config edit only, no asset
  pipeline rewrite, no font-source swap.

**Non-Goals:**
- Replacing `typeface-lato` with a different font or a system
  stack.
- Rewriting the entire webpack config to webpack 5 idioms (only
  the binary-asset rule is in scope).
- Changing how the embedded sticky player loads fonts (it
  already uses a system-font fallback and does not import
  `typeface-lato`).
- Adding font-display tuning or subsetting.

## Decisions

### Decision 1: Use `type: 'asset/resource'` instead of `file-loader`

Replace the `file-loader` rule with webpack 5's built-in
`asset/resource` type, configured to emit files with their
original names so debugging artifacts stay readable:

```js
{
  test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
  type: 'asset/resource',
  generator: {
    filename: '[name][ext]',
  },
}
```

**Rationale:** Asset modules are webpack 5's built-in,
non-deprecated mechanism for binary assets and integrate
cleanly with css-loader's `url()` resolution. With a single
pipeline owning `.woff2`, the double-emit goes away. The output
filenames match what file-loader produced (no `[hash]`), so
relative paths from the source CSS continue to work.

**Alternatives considered:**

- *Add `type: 'javascript/auto'` to the existing file-loader
  rule.* This is the documented workaround for the double-emit
  bug. It would work, but keeps a deprecated loader on the
  critical path. The marginal effort to switch to asset modules
  is worth it.
- *Drop the explicit rule entirely and let asset modules handle
  everything by default.* Asset modules without an explicit rule
  emit content-hashed names by default
  (`[hash][ext][query]`). This would change every emitted asset
  filename and likely break other references; the explicit
  generator filename keeps current behavior.
- *Replace `typeface-lato` with a non-npm-packaged font import
  (or a system stack).* Out of scope — the task is to make the
  current font pipeline work, not change the font.

### Decision 2: Keep `web_accessible_resources` unchanged

The README's failure mode #3 hypothesised that the fonts might
need to be listed in `web_accessible_resources`. They do not:
Chrome only enforces `web_accessible_resources` for
cross-context requests (a regular web page fetching from the
extension origin). The popup and options pages are themselves
extension pages, so same-origin font loads are unrestricted.
Verification: once Decision 1 is applied, fonts decode and
render without any manifest change.

### Decision 3: Catch regressions with a build-time wOF2 check

Add a small script run after `yarn build:<browser>` (e.g. via a
postbuild npm script) that scans `build/<browser>/` for `.woff2`
files and asserts each starts with the `wOF2` magic header
(bytes `0x77 0x4F 0x46 0x32`). If any font is a JS shim or
otherwise corrupted, the build fails with a clear message.

**Rationale:** The original bug was silent — the build produced
output that *looked* fine (correctly-named files in the right
folder) but failed at runtime. A magic-byte check is a five-line
script and prevents this from ever being silent again.

**Alternative considered:** *Add a Playwright/puppeteer test
that loads the popup and asserts the computed font-family.*
Higher confidence but much more infrastructure for a cosmetic
bug; revisit only if other font issues recur.

## Risks / Trade-offs

- **Other binary assets in `fileExtensions` change emission
  behavior.** → The rule covers `jpg, jpeg, png, gif, eot, otf,
  svg, ttf, woff, woff2`. Asset modules with
  `generator.filename: '[name][ext]'` match file-loader's
  `[name].[ext]` output. Spot-check after the change that any
  existing image/icon imports in popup/options still resolve.

- **css-loader version compatibility.** → css-loader v6+ works
  with asset modules out of the box. Check `package.json`; if
  css-loader is older than that, the fix may need a bump.

- **Watch-mode caching.** → `extension-build-watcher` (the
  `yarn watch` script) shares this webpack config. Cached
  modules from a prior watch session could mask the fix; the
  verification step requires a clean rebuild
  (`yarn build:chrome` after removing `build/chrome/`).

## Migration Plan

1. Apply the webpack config change on a feature branch.
2. Remove existing `build/chrome/`, `build/firefox/`,
   `build/safari/` to force a clean rebuild.
3. Run `yarn build:chrome` (and firefox/safari).
4. Verify no hashed-name woff2 shims are emitted and the named
   woff2 files have the `wOF2` magic.
5. Load the unpacked extension; open popup with devtools; confirm
   no decode errors and Lato is the computed font.

**Rollback:** revert the single webpack.config.js commit. The
change is isolated to one rule and the postbuild check.
