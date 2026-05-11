# extension-font-assets Specification

## Purpose
TBD - created by archiving change fix-extension-popup-font-decode. Update Purpose after archive.
## Requirements
### Requirement: Font files emitted by the extension build SHALL be valid binary fonts

The browser-extension webpack build SHALL emit every `.woff2`,
`.woff`, `.ttf`, `.eot`, and `.otf` file referenced through
`import` or CSS `url()` exactly once, with the file's original
binary content preserved. The emitted file MUST be a valid font
binary that the browser can decode — for `.woff2`, this means
the first four bytes are the ASCII magic header `wOF2`
(`0x77 0x4F 0x46 0x32`). No JavaScript-module shim or other
non-font payload may be emitted under a font extension.

#### Scenario: Popup opens without font decode errors

- **WHEN** the operator loads the unpacked Chrome extension and
  opens the popup with devtools open
- **THEN** the console MUST NOT contain any
  `Failed to decode downloaded font` warning, and the popup's
  computed `font-family` for body text MUST resolve to `Lato`
  (not the system fallback).

#### Scenario: Emitted woff2 has the wOF2 magic header

- **WHEN** a clean `yarn build:chrome` (or firefox/safari) runs
  to completion
- **THEN** every `.woff2` file in `build/<browser>/` MUST begin
  with the four-byte sequence `wOF2`, indicating a valid woff2
  binary.

#### Scenario: No JavaScript-shim files are emitted with font extensions

- **WHEN** the build completes
- **THEN** there MUST NOT exist any file in `build/<browser>/`
  with a font extension whose contents begin with
  `export default`, `module.exports`, or another JavaScript
  module marker — every font file is a binary asset.

### Requirement: Font emission SHALL use a single webpack pipeline

The webpack configuration SHALL register exactly one rule (or
asset-module type) that owns each font extension. There MUST NOT
be a configuration where `file-loader` (or another emitting
loader) and webpack 5 asset modules both produce output for the
same extension, since the double pipeline is what produced the
broken JS-shim woff2 in the first place.

#### Scenario: Single rule owns woff2 emission

- **WHEN** a maintainer inspects
  `packages/browser-extension/webpack.config.js`
- **THEN** there is exactly one `module.rules` entry that
  matches `.woff2` (and the other font extensions), and that
  entry uses webpack 5's built-in asset-module `type`
  (`asset/resource`) rather than the deprecated `file-loader`.

### Requirement: Build SHALL fail fast when font assets are corrupted

The browser-extension build SHALL include a post-build
verification step that scans the per-browser build directory
for font files and asserts each is a valid binary by checking
its magic header. If any font file is invalid, the build MUST
exit with a non-zero status and a clear error message naming
the offending file.

#### Scenario: Corrupted woff2 fails the build

- **WHEN** a hypothetical regression causes a `.woff2` file in
  `build/chrome/` to be a JS module shim instead of a font
- **THEN** the `yarn build:chrome` command MUST exit non-zero
  with an error message identifying the broken file by name,
  rather than completing successfully.

#### Scenario: Clean build passes the magic-header check

- **WHEN** `yarn build:chrome` is run against the fixed
  configuration on a clean tree
- **THEN** the post-build verification reports all font files
  valid and the command exits zero.

### Requirement: Fix SHALL hold across all supported extension targets

The font-emission guarantees above SHALL apply to every browser
target the extension builds: `chrome`, `firefox`, and `safari`
(the values enumerated by `SUPPORTED_BROWSERS` in
`webpack.config.js`). The same webpack configuration drives all
three, so the verification step MUST be runnable per target.

#### Scenario: Firefox and Safari builds also emit valid fonts

- **WHEN** `yarn build:firefox` and `yarn build:safari` are run
- **THEN** the resulting `build/firefox/` and `build/safari/`
  directories each pass the same magic-header check that
  `build/chrome/` does, with no decode errors when those builds
  are loaded in their respective browsers.

