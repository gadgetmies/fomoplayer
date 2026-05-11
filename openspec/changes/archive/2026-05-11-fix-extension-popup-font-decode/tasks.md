## 1. Webpack config fix

- [x] 1.1 In `packages/browser-extension/webpack.config.js`, replace the `file-loader` rule (lines 81–87) that matches `fileExtensions` with a single webpack 5 asset-module rule: `type: 'asset/resource'` and `generator: { filename: '[name][ext]' }`. Keep the `fileExtensions` array unchanged.
- [x] 1.2 Confirm `file-loader` is no longer referenced anywhere in the extension package; if so, remove it from `package.json` `devDependencies` and run `yarn install` to update the lockfile.
- [x] 1.3 Leave `manifest.base.json` `web_accessible_resources` untouched — verify (in a later task) that no manifest change is needed.

## 2. Build-time font verification

- [x] 2.1 Add a small Node script at `packages/browser-extension/utils/verify-font-assets.js` that takes `--browser <chrome|firefox|safari>`, scans `build/<browser>/` for `.woff2` files, reads the first four bytes of each, and asserts they equal the ASCII `wOF2`. For `.woff`, check the first four bytes are `wOFF`. Exit non-zero with a message naming the offending file on failure.
- [x] 2.2 Wire the verification step into `utils/build.js` so it runs after a successful webpack build (called with the same `BROWSER` env var). On failure, ensure the build exits non-zero.
- [x] 2.3 Decide whether watch mode (`utils/watch.js`) should also call the verifier; if cheap, run it after each successful rebuild — otherwise gate it behind production builds only and document why in code.

## 3. Clean rebuild and runtime verification (chrome)

- [x] 3.1 Remove `packages/browser-extension/build/chrome/` to force a clean rebuild and avoid stale-cache false positives.
- [x] 3.2 Run `yarn build:chrome` and confirm the build exits zero. Inspect `build/chrome/` — there must be no hash-named `.woff2` files; the named files (e.g. `lato-latin-100.woff2`) must remain.
- [x] 3.3 Spot-check with `xxd build/chrome/lato-latin-100.woff2 | head -1` that the magic bytes are `wOF2` and the file size is non-trivial (>10 KB).
- [x] 3.4 Load the unpacked extension in Chrome, open the popup with devtools open, and confirm no `Failed to decode downloaded font` warning appears in the console. — Verified by operator.
- [x] 3.5 Use Chrome devtools to verify the popup's body computed `font-family` resolves to `Lato`, not the system fallback. — Verified by operator.
- [x] 3.6 Open the options page (extension management → Details → Extension options) and repeat the console and computed-font checks. — Verified by operator.

## 4. Cross-browser verification

- [x] 4.1 Remove `build/firefox/` and run `yarn build:firefox`; confirm the verifier passes and the magic-byte spot check succeeds. — Deferred by operator; same webpack config drives all targets and the build-time verifier guards regressions.
- [x] 4.2 Load the unpacked extension in Firefox, open the popup (and options), and confirm no font decode errors and that Lato renders. — Deferred by operator; revisit when Firefox build is needed.
- [x] 4.3 Remove `build/safari/` and run `yarn build:safari`; confirm the verifier passes. Safari extension load is harder to automate — at minimum confirm the build artifact passes the byte-level checks. — Deferred by operator.

## 5. Regression sweep on other emitted assets

- [x] 5.1 Diff `build/chrome/` before and after the fix to identify any other asset filenames that changed (icons, SVGs, etc.). For each, confirm the matching reference in popup/options/content scripts still resolves (no 404s in devtools Network panel during popup load).

      Static check result: no non-font binary assets are emitted by the popup/options/content entries — `build/chrome/` after the fix contains only bundle JS/HTML/LICENSE files, `manifest.json`, and the 20 named Lato `.woff`/`.woff2` files. Bundle source confirms the CSS `url()` references resolve to the named woff2 files. Operator should still confirm no 404s in the Network panel under task 3.4–3.6.
- [x] 5.2 Open the content-bandcamp script's host page (a Bandcamp release) with devtools open and confirm no new asset-related console errors after the rebuild. — Deferred by operator; the content script entry does not import typeface-lato and the static asset listing in 5.1 covers the popup/options surface.

## 6. Update backlog status

- [x] 6.1 When all acceptance criteria from `backlog/tasks/026-extension-popup-font-decode-failure/README.md` are satisfied, move the backlog symlink from `backlog/todo/e-026-extension-popup-font-decode-failure` to `backlog/to-be-verified/` per the backlog README's status convention.
- [x] 6.2 Update the task README with brief notes on the diagnosed cause and the file-loader → asset/resource fix for future readers.
