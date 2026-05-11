## Why

The browser extension's popup and options pages log
`Failed to decode downloaded font: chrome-extension://<id>/<hash>.woff2`
on every open. The fonts (Lato, imported via `typeface-lato`) are
emitted to `build/<browser>/` and the URL resolves, but the bytes
Chrome receives are a JavaScript module shim — `export default _…`,
64 bytes — not a woff2. Chrome rejects them and falls back to a
system font. The result is cosmetic (the popup still renders) but
the console error spams every popup open and the intended Lato
typeface never loads.

Root cause confirmed by inspecting `build/chrome/`: the hashed
woff2 (e.g. `45390e2f480aa2e30c0b.woff2`) starts with `export
default _`, while the same font also exists under its original
name (`lato-latin-100.woff2`) with the correct `wOF2` magic and
full ~21 KB payload. This is the webpack 5 asset-modules vs
`file-loader` double-pipeline conflict: `file-loader` is
registered for `.woff2` and emits the named copy, while
css-loader's `url()` resolution goes through webpack's built-in
asset module pipeline and emits a JS shim under the hashed name —
the name the CSS actually references.

## What Changes

- Eliminate the double-pipeline so `.woff2` (and `.woff`, `.ttf`,
  `.eot`, `.otf` for consistency) are emitted exactly once with
  intact binary content and a stable name.
- Update `packages/browser-extension/webpack.config.js` to use
  webpack 5's built-in `type: 'asset/resource'` for font files
  (and other binary assets currently routed through
  `file-loader`), removing the `file-loader` rule for fonts.
- Confirm `web_accessible_resources` in `manifest.base.json` does
  not need additional entries — popup and options pages load the
  fonts same-origin from the extension, which Chrome allows
  without listing.
- Add a build-time sanity check (or document a verification step)
  that confirms emitted `.woff2` files start with the `wOF2`
  magic header, so this regression cannot return silently.

## Capabilities

### New Capabilities

- `extension-font-assets`: how the browser-extension webpack
  build emits font files so popup, options, and other extension
  pages can decode and render them.

### Modified Capabilities

<!-- None. extension-build-watcher covers watch-mode rebuilds, not
     asset emission semantics. -->

## Impact

- Code: `packages/browser-extension/webpack.config.js` (module
  rules, `fileExtensions` array).
- Build output: `packages/browser-extension/build/<browser>/`
  — hashed-name JS-shim woff2 files disappear; only valid
  binary woff2/woff files remain.
- Runtime: popup and options pages render in Lato; no
  `Failed to decode downloaded font` console errors.
- No API, manifest permission, or dependency changes expected;
  `typeface-lato` continues to be the font source.
- Cross-browser: same webpack config drives chrome, firefox, and
  safari builds — fix must hold for all three.
