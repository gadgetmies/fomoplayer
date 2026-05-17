## 1. Xcode project hygiene (foundation for the source bundle)

- [x] 1.1 Recorded macOS app scheme: `Fomo Player (macOS)`. Documented for recipients; the CI workflow no longer invokes `xcodebuild`.
- [x] 1.2 Confirmed `project.pbxproj` references `build/safari/` files directly via relative `path = "../../build/safari/<file>"` entries. The source-bundle zip layout (`Fomo Player/` + `build/safari/` at the same level) makes these paths resolve when the recipient extracts the zip.
- [x] 1.3 Local end-to-end confirmed via Xcode ⌘R (Apple Development signing with Personal Team): extension installs and works in Safari.
- [x] 1.4 Confirmed the originally-planned ad-hoc CLI `.app` path does NOT produce a usable extension: Safari refuses to register or operate ad-hoc-signed Safari Web Extensions. This finding drove the pivot from "CI-built `.app`" to "source bundle". Documented in design.md.
- [x] 1.5 Regenerated `packages/browser-extension/Fomo Player/` via `xcrun safari-web-extension-converter "build/safari" --project-location . --app-name "Fomo Player" --bundle-identifier "com.yourCompany.Fomo-Player" --swift --no-open --no-prompt`. The previous project carried stale file references to webpack-emitted hashed filenames that the current webpack config no longer produces. Bundle IDs preserved. Backup at `.scratch/Fomo Player.bak-<timestamp>` (untracked).
- [x] 1.6 Added `regenerate:safari-xcodeproj`, `xcodebuild:safari`, `build:safari:app`, and `clean:safari:app` yarn scripts to `packages/browser-extension/package.json` so maintainers can rebuild / regenerate without memorising flags.

## 2. Repository configuration

- [ ] 2.1 Add a `FRONTEND_URL_PROD` repository variable in the GitHub repo Settings → Variables → Actions, set to `https://fomoplayer.com`.
- [ ] 2.2 Confirm `GITHUB_TOKEN` default permissions in the repo settings include `contents: write` (needed for `softprops/action-gh-release`); if not, the workflow will need an explicit `permissions:` block.

## 3. Add the workflow file

- [x] 3.1 Created `.github/workflows/extension-release.yml` with `on: { push: { tags: ['v*'] }, workflow_dispatch: {} }` and a top-level `permissions: contents: write`.
- [x] 3.2 Added `version` job that emits `value` output — strips leading `v` from `github.ref_name` on tag pushes, falls back to the 7-char short SHA on dispatch.
- [x] 3.3 Collapsed all three browser builds into a single `build` job (Ubuntu) — `actions/checkout@v4`, `actions/setup-node@v4` (Node 22, yarn cache), `yarn install --frozen-lockfile`, then `yarn workspace fomoplayer_browser_extension build:chrome`, `build:firefox`, and `build:safari` with `FRONTEND_URL: ${{ vars.FRONTEND_URL_PROD }}`. No macOS runner needed.
- [x] 3.4 `build` job runs `yarn workspace fomoplayer_browser_extension lint:firefox` after the Firefox build; lint failure fails the job.
- [x] 3.5 `build` job zips `build/chrome/` and `build/firefox/` with `zip -r -X` to versioned filenames and uploads each via `actions/upload-artifact@v4` with `if-no-files-found: error`.
- [x] 3.6 **(superseded by 3.9)** Originally added a separate `safari` job on `macos-latest` running `xcodebuild`. Removed when the model changed to a source bundle — see task 3.9.
- [x] 3.7 **(superseded by 3.9)** Originally ran `xcodebuild` with ad-hoc signing. Removed: ad-hoc-signed `.app` bundles silently fail Safari's API gates (`SFSafariExtensionManager`, pluginkit registration), so the produced artifact would not be usable. See design.md → "Why source-bundle Safari, not a built .app".
- [x] 3.8 **(superseded by 3.9)** Originally zipped `Fomo Player.app` via `ditto`. Replaced by source-bundle packaging in 3.9.
- [x] 3.9 In the Linux `build` job, after `yarn build:safari`, package a source bundle: stage `packages/browser-extension/Fomo Player/`, `packages/browser-extension/build/safari/`, and `packages/browser-extension/safari-source-README.md` (renamed to `README.md`) into a `fomo-player-safari-source-<version>/` directory, then zip and upload via `actions/upload-artifact@v4`. The Xcode project's `path = "../../build/safari/..."` references resolve against this layout when the recipient extracts the zip.
- [x] 3.10 Added `packages/browser-extension/safari-source-README.md` — recipient-facing install doc covering prerequisites (Mac, Xcode, free Apple ID), the Signing & Capabilities team-selection step per target, ⌘R, Safari enablement, and the 7-day Personal Team expiry caveat. Bundled into the Safari zip as `README.md`.

## 4. Attach artifacts to Releases on tag triggers

- [x] 4.1 Added `release` job that depends on `version` and `build` and runs only when `github.event_name == 'push'`.
- [x] 4.2 `release` job downloads every uploaded artifact via `actions/download-artifact@v4` with `merge-multiple: true` so all three zips land in one directory.
- [x] 4.3 `release` job uses `softprops/action-gh-release@v2` with `tag_name: ${{ github.ref_name }}`, the three versioned zip paths, `fail_on_unmatched_files: true`, and a templated body covering Chrome / Firefox install steps inline, plus a pointer to the bundled `README.md` for the Safari source-bundle flow.
- [x] 4.4 `release` job is gated by `if: github.event_name == 'push'`, so `workflow_dispatch` runs only produce workflow artifacts and never touch a GitHub Release.

## 5. End-to-end verification

- [ ] 5.1 Manually dispatch the workflow on `master` and confirm all three archives appear in the run's Artifacts section: `fomo-player-extension-chrome-<sha>.zip`, `fomo-player-extension-firefox-<sha>.zip`, `fomo-player-extension-safari-source-<sha>.zip`.
- [ ] 5.2 Download each archive and confirm: Chrome zip unpacks into a `manifest.json` + bundles directory loadable via `chrome://extensions/`; Firefox zip loads via `about:debugging`; Safari zip unpacks into `fomo-player-safari-source-<sha>/` containing `Fomo Player/`, `build/safari/`, and `README.md`. Open `Fomo Player/Fomo Player.xcodeproj`, follow the bundled README's steps (Team selection → ⌘R), and confirm the extension installs into Safari.
- [ ] 5.3 Cut a throwaway `v0.0.0-test` tag and confirm the GitHub Release is created with all three assets attached, then delete the test tag and Release.
- [ ] 5.4 Confirm dispatching with `FRONTEND_URL_PROD` temporarily unset produces a failing build (sanity check on the no-hard-coded-fallback guardrail).

## 6. Documentation

- [x] 6.1 Added a "Releases" section to `packages/browser-extension/README.md` covering the user-facing install steps per browser, the maintainer-facing tagging workflow, and the manual-dispatch path.
- [x] 6.2 Documented the `FRONTEND_URL_PROD` repository variable + `GITHUB_TOKEN` write-permission requirement in the same section.
