---
id: 026
title: Browser-extension fonts fail to load with "Failed to decode downloaded font"
effort: S
created: 2026-05-06
---

# Browser-extension fonts fail to load with "Failed to decode downloaded font"

## Why

The Chrome extension's popup / options pages report:

```
Failed to decode downloaded font:
chrome-extension://hgkbdboonokhndinhoiggbghnoklldko/45390e2f480aa2e30c0b.woff2
```

The fonts are imported via `import 'typeface-lato'` in
`packages/browser-extension/src/js/popup.js` and `options.js`. The
build emits the woff2 files into the extension's build output (e.g.
`build/chrome/45390e2f480aa2e30c0b.woff2`), so the URL is reachable
in principle, but Chrome can't decode the bytes — it treats the
response as not-a-font.

"Failed to decode" typically means one of:

1. The browser is downloading the file but receiving HTML / a wrong
   MIME / a corrupted response (e.g. extension serves a 404 HTML
   page because the asset isn't actually present at the resolved
   URL).
2. The font file is present but emitted with a `Content-Type` that
   the browser rejects for fonts. (Chrome is generally lenient for
   `chrome-extension://` URLs but can still refuse if the resource
   is otherwise wrong-shaped.)
3. The font is not in `web_accessible_resources`, so Chrome serves
   an opaque rejection that decodes to garbage.
4. The webpack `file-loader` rule conflicts with webpack 5's
   built-in asset modules — `typeface-lato`'s CSS imports the
   `.woff2` files, css-loader rewrites the `url()`, and the asset
   ends up emitted with a content-hash name (`45390…woff2`) instead
   of the configured `[name].[ext]`. If both pipelines emit the
   file, one copy may be a corrupted shim.

The popup falls back to a system font, so this is cosmetic, but it
spams the console on every popup open and is a regression from
"fonts work end-to-end".

## What

- Confirm which of the failure modes above is happening: open the
  Chrome devtools Network tab on the popup, find the woff2 request,
  check the response status, headers, and downloaded bytes (the
  first four bytes of a valid woff2 are `wOF2`).
- Decide on the fix:
  - If `web_accessible_resources` is missing the woff2 entries, add
    a `*.woff2` glob (and `*.woff` / `*.ttf` if any are emitted).
  - If the file-loader / asset-modules conflict is the cause,
    update `webpack.config.js` to either drop the `file-loader`
    rule for fonts (let webpack 5's `asset/resource` handle them)
    or set `type: 'javascript/auto'` to avoid the double-pipeline.
  - If the font is corrupted at emit time, run a sanity check that
    `xxd build/chrome/45390e2f480aa2e30c0b.woff2 | head -1` shows
    the `wOF2` magic header.
- Re-run `yarn build:chrome`, reload the extension, open the popup
  with devtools open, confirm no "Failed to decode" warnings and
  the Lato typeface visibly renders.

## Acceptance criteria

- [ ] Opening the popup or options page produces no
      "Failed to decode downloaded font" console errors.
- [ ] The popup renders in the Lato typeface, not the system
      fallback.
- [ ] No regression to other pages bundled by the same webpack
      build (Bandcamp content scripts, audio host, etc.).
- [ ] The fix is durable — the next `yarn build:chrome` does not
      re-introduce the corrupted asset.

## Code pointers

- `packages/browser-extension/src/js/popup.js:6` and
  `packages/browser-extension/src/js/options.js:6` —
  `import 'typeface-lato'`.
- `packages/browser-extension/webpack.config.js:24-87` — the
  `fileExtensions` glob and the `file-loader` rule that emits
  fonts.
- `packages/browser-extension/src/manifest.base.json` —
  `web_accessible_resources`. Today only the auth-callback and
  audio-player HTMLs are listed; fonts may need to join.
- `packages/browser-extension/build/chrome/*.woff2` — the actual
  emitted files. Inspect them after a fresh build to see whether
  the magic header is intact.

## Out of scope

- Replacing typeface-lato with a system stack or a different font.
- Changing how the embedded sticky player loads its fonts (it
  already uses a `font-family: 'Helvetica Neue', Helvetica, Arial,
  sans-serif` fallback).

## Open questions

- Does this also affect Firefox / Safari builds, or is it
  Chrome-only? Reproduce in each browser before committing to a
  fix.
- Is the missing-from-`web_accessible_resources` rejection actually
  the cause, or a red herring? Chrome usually only enforces that
  for cross-context requests, but the popup is same-origin to its
  own extension.
