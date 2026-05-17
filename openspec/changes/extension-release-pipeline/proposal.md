## Why

There is no automated way to produce shippable browser-extension artifacts. Today a maintainer has to install Node, set `FRONTEND_URL`, run `yarn build:{chrome,firefox,safari}` on their laptop, and — for Safari — additionally open Xcode to wrap the converted Web Extension into a `.app`. The output is never checked into a release, so anyone wanting to side-load the extension has to reproduce that pipeline locally. We want tagging a release to produce all three browser builds as downloadable artifacts attached to a GitHub Release.

## What Changes

- Add a `.github/workflows/extension-release.yml` workflow that, on a release-shaped trigger (a `v*` tag push, or `workflow_dispatch`), produces:
  - Chrome build → `fomo-player-extension-chrome-<version>.zip`
  - Firefox build → `fomo-player-extension-firefox-<version>.zip` (plus `web-ext lint` as a gate)
  - Safari build → `Fomo Player.app` packaged as `fomo-player-extension-safari-macos-<version>.zip` (unsigned / ad-hoc signed, for local side-loading via "Allow Unsigned Extensions")
- Run Chrome and Firefox builds together on a single `ubuntu-latest` job (they share toolchain — Node + yarn + webpack). Run the Safari build as a **separate job** on `macos-latest` because it needs Xcode and `xcodebuild` and has no shared steps beyond `yarn install` + `yarn build:safari`.
- Attach all produced archives to the GitHub Release on tag-triggered runs. On `workflow_dispatch` runs, leave them as workflow artifacts (no Release created).
- Inject `FRONTEND_URL` from a repository variable (`vars.FRONTEND_URL_PROD`) so the build is environment-correct and the existing "build fails fast when `FRONTEND_URL` unset" guardrail still holds.
- No signing certificates, no notarization, no store submission in this change. Safari output requires the user to enable Safari → Develop → Allow Unsigned Extensions; that's documented in the release notes template the workflow writes.

## Capabilities

### New Capabilities
- `extension-release-pipeline`: CI workflow that builds Chrome, Firefox, and Safari browser-extension packages on demand and attaches them to a GitHub Release.

### Modified Capabilities
<!-- None. This is a CI/CD addition; no existing spec changes its requirements. -->

## Impact

- **New file:** `.github/workflows/extension-release.yml`.
- **Repository configuration:** one new repository variable, `FRONTEND_URL_PROD`, used by the workflow at build time. No new secrets — the unsigned Safari path does not need Apple Developer credentials.
- **No source-tree changes** to `packages/browser-extension/`. The workflow consumes the existing `yarn build:{chrome,firefox,safari}` scripts and the committed `Fomo Player/Fomo Player.xcodeproj` Xcode project unchanged.
- **No runtime impact** on the running app — this is purely a release-time pipeline.
- **GitHub Actions cost:** macOS runner minutes for Safari builds (~5-10 min per release on `macos-latest`); Linux job for Chrome+Firefox (~3 min). Only runs on release tags / manual dispatch, so per-PR cost is zero.
