## Context

The repository already ships three browser extensions from one source tree at `packages/browser-extension/`. Chrome and Firefox builds are pure Node + webpack and produce a directory you zip and ship. Safari has an extra step: `xcrun safari-web-extension-converter` was used to generate a host `.app` Xcode project (already committed at `packages/browser-extension/Fomo Player/Fomo Player.xcodeproj/`), and a release-time `xcodebuild` is needed to rebuild that app with the latest `build/safari/` resources.

Existing workflows in `.github/workflows/` (`node.js.yml`, `pr-demo.yml`, `zap.yml`) cover CI tests and PR preview deploys but never build the extension. Releases are currently manual: a maintainer builds locally and posts the zip to a Release by hand. We want to retire that manual step without taking on Apple Developer code-signing infrastructure yet.

Constraint from `CLAUDE.md`: deployment URLs MUST come from configuration. The build scripts already enforce this — `yarn build:*` fail fast when `FRONTEND_URL` is unset. The workflow must therefore source `FRONTEND_URL` from repo configuration, not bake it in.

## Goals / Non-Goals

**Goals:**
- One workflow file that produces all three extension archives on demand.
- All builds run on a single Linux runner — no macOS minutes, no Xcode in CI.
- Tag a release → archives are attached to the GitHub Release automatically.
- Manual dispatch path so maintainers can produce builds without cutting a tag (useful for testing the pipeline, side-loading a pre-release build).
- Build fails fast if `FRONTEND_URL_PROD` is unset — preserves the existing guardrail.
- Safari recipients get a source bundle with self-contained install instructions; signing happens on their machine, with their Apple ID.

**Non-Goals:**
- Code-signing for any browser in CI. Chrome users load unpacked; Firefox uses unsigned XPI for self-hosted; Safari users compile + sign locally via Xcode with their own Apple ID.
- Store submission (Chrome Web Store / AMO signed XPI / Mac App Store / TestFlight) — those need credentials and review pipelines that belong in a future change.
- iOS Safari build — desktop Safari is the scope here.
- Producing a pre-built Safari `.app` — Apple's Safari extension APIs (`SFSafariExtensionManager`, plugin registration) gate on a trusted signature, and ad-hoc-signed `.app` bundles fail those gates silently. Without a paid Apple Developer membership ($99/yr) + notarization, a CI-built `.app` is not actually installable for end users; we therefore don't ship one.
- Notarization, hardened runtime, entitlements review.
- A signed `.crx` for Chrome. Browsers load unpacked from `build/chrome/`; we ship the zipped directory and let the consumer choose how to install it.

## Decisions

### One Ubuntu job for all three browsers

Originally planned as two jobs (Ubuntu for Chrome/Firefox, macOS for Safari `.app`). Collapsed to one Ubuntu job after discovering that ad-hoc-signed Safari `.app` bundles don't actually work for end users (see "Why source-bundle Safari, not a built .app" below). Once `xcodebuild` is off the table, the macOS runner has no reason to exist — webpack runs identically on Linux.

**Why one job for all three:** Chrome, Firefox, and Safari builds share 100% of their setup — Node 22, yarn cache, `yarn install`, and a `yarn build:<browser>` invocation each. Three separate jobs would mean three `yarn install` runs. One job, three `yarn build:*` steps, is the right granularity.

### Why source-bundle Safari, not a built .app

This is the design decision the implementation discovered the hard way. Initial plan was to produce an unsigned `.app` via `xcodebuild` in a macOS job, with the recipient enabling "Allow Unsigned Extensions" in Safari to load it. That plan does not work, and the reason is subtle.

Apple's Safari extension APIs (`SFSafariExtensionManager.getStateOfSafariExtension`, `SFSafariApplication.showPreferencesForExtension`, plus the system's pluginkit registration) gate on a **trusted code signature**. Ad-hoc signing (`CODE_SIGN_IDENTITY="-"`) is not trusted by these APIs — they silently return error / nil state. Symptoms when running an ad-hoc `.app`: the host app launches but its "Open Safari Extensions Settings" button is a no-op, the extension isn't registered with pluginkit, and Safari's Extensions list never surfaces it — even with "Allow Unsigned Extensions" enabled (that toggle controls whether Safari *displays* an already-registered unsigned extension; it doesn't bypass the registration gate).

The only ways to produce a `.app` that actually works for end users:
1. **Apple Development cert** (free, but bound to the developer's Apple ID + machine — can't be distributed). This is what Xcode's ⌘R does locally; it can't be replicated in CI for distribution.
2. **Developer ID Application cert + notarization** (paid Apple Developer membership, $99/yr). This works but requires importing credentials into CI and adding `codesign` + `notarytool` steps.

Both are out of scope for this change. The source-bundle approach sidesteps the problem entirely: ship the Xcode project + webpack output + an install README; each recipient signs locally with their own free Apple ID (a "Personal Team" certificate), and Safari accepts it because it's a real signature.

**Trade-off the recipient bears:** Personal Team provisioning profiles expire every ~7 days — the recipient has to re-open the project in Xcode and ⌘R to refresh. That's the price of not having a $99/yr paid membership. Acceptable for our audience (devs / power users comfortable with Xcode); not acceptable for mass distribution. The bundled `README.md` documents this caveat up front.

**Why not also distribute a pre-built `.app`?** It would not work for end users and would be more confusing than helpful. We'd be shipping a broken artifact.

### Trigger model: tag push + workflow_dispatch

**Why over `release.created`:** the `release.created` event fires when a Release is created in the GitHub UI, which would require the maintainer to draft the Release *before* the binaries exist — awkward. Tag-driven gives the natural flow: cut tag → workflow builds → workflow updates/creates the Release.

**Why include `workflow_dispatch`:** lets maintainers test the workflow without cutting tags, and lets them produce ad-hoc unsigned builds for testers. Dispatch runs upload to workflow artifacts only (no Release), so they don't pollute the Release timeline.

**Why not on every push:** we don't want to burn macOS minutes on every commit, and the artifacts have no value outside release contexts.

### Versioning: tag → strip leading `v`; dispatch → short SHA

The release version drives archive filenames. For tags, `v1.2.3` becomes `1.2.3` in the filename. For dispatch, the short commit SHA is the fallback. The version is computed once at the top of the workflow and passed to both jobs.

**Why not read `package.json` version:** `packages/browser-extension/package.json` is at `0.1.0` and isn't bumped on releases; the git tag is the source of truth.

**Why not `github.run_number`:** opaque to humans and not stable across re-runs.

### FRONTEND_URL via repository variable, not secret

`FRONTEND_URL_PROD` is a public URL (`https://fomoplayer.com`) — it appears in the shipped bundle anyway. Storing it as a repository **variable** rather than a **secret** is correct: variables are visible in logs and PRs, which matches the data's actual sensitivity.

**Why not hard-code as a workflow-level `env`:** the project's CLAUDE.md explicitly forbids deployment domains in source. The workflow file is source. Routing through `vars.FRONTEND_URL_PROD` keeps the rule intact and lets a self-hoster of this project point at their own backend by changing one repo setting.

### Safari source-bundle layout

The Safari zip has the recipient's directory expectations baked in:

```
fomo-player-safari-source-<version>/
  Fomo Player/        ← Xcode project + native host app source
  build/
    safari/           ← webpack output
  README.md           ← step-by-step recipient install doc
```

`Fomo Player/Fomo Player.xcodeproj/project.pbxproj` references files at `../../build/safari/<file>`. Two `..` segments up from `Fomo Player/` lands at the bundle root, then down into `build/safari/` — so this layout makes the paths resolve when the recipient extracts the zip. Don't repackage the zip with a different layout.

**Recipient-facing README is checked into the repo** at `packages/browser-extension/safari-source-README.md`, not generated at workflow time. Keeping it in source means PR review, history, and the maintainer-facing README can link to the same canonical install steps.

**Why include the entire `Fomo Player/` directory:** It contains the host-app sources (Swift + Info.plists + storyboards + entitlements stub) plus the `.xcodeproj`. Without it, the recipient would only have web extension files and nothing to ⌘R. The directory is ~1 MB, dominated by `project.pbxproj`; not a meaningful artifact size cost.

**Caveat for future contributors:** the Xcode project references webpack outputs by exact filename via `project.pbxproj` entries — if webpack starts emitting a new file (or renames one) the recipient's Xcode build will be missing it until someone regenerates the project (`yarn regenerate:safari-xcodeproj`). JS bundle names are stable today (`background.bundle.js`, etc.), and font asset names are stable too (e.g. `lato-latin-100.woff`), so the everyday risk is low.

## Risks / Trade-offs

- **[Risk]** Re-running the workflow on the same tag could overwrite or duplicate Release assets. → **Mitigation:** use `softprops/action-gh-release@v2` with `files: …` — it upserts assets idempotently and keeps an existing Release intact.
- **[Risk]** The Xcode project's `project.pbxproj` references webpack outputs by exact filename. If a future webpack change emits a new file (e.g. a new font asset), the recipient's Xcode build will silently miss it. → **Mitigation:** documented in this design and in the bundled README; `yarn regenerate:safari-xcodeproj` is the fix path. A future change could swap individual file references for a folder reference in Xcode to make this self-healing.
- **[Trade-off]** Safari recipients must have Xcode installed (~7 GB download) and an Apple ID, and re-sign every ~7 days. This is the cost of not holding a paid Apple Developer membership. Acceptable for the side-loading audience; not acceptable for mass distribution — a future change can add Developer ID signing + notarization to produce a pre-built `.app` if reach matters.
- **[Trade-off]** No Chrome `.crx` packaging — consumers load unpacked from the zipped `build/chrome/` directory. Adding `.crx` packaging would require generating + storing a signing key, which exceeds scope.
- **[Trade-off]** Firefox archive is unsigned. Recipients use Firefox's "Load Temporary Add-on" path and the extension is removed on Firefox restart. Signed XPI via AMO is out of scope here.

## Migration Plan

This is a pure addition — no existing workflow is removed, no source files are touched outside `.github/workflows/`. Rollout:

1. Land the workflow on `master`.
2. Manually dispatch the workflow once to validate Chrome / Firefox / Safari archives produce successfully (and the Xcode strings are right).
3. Cut a real `v0.1.0` tag and verify the Release auto-populates with the three assets.
4. Update `packages/browser-extension/README.md` to point users at the Releases page instead of "run `yarn build:safari` locally".

Rollback: delete `.github/workflows/extension-release.yml`. There is no state, no other artifact, no consumer depending on the workflow's outputs except humans downloading from the Releases page.

## Open Questions

- **Should the workflow gate the Safari job on the Linux job succeeding?** Default: no, they're independent — failing one shouldn't waste the other. Could revisit if a partial release set is confusing.
- **Should `workflow_dispatch` accept a `version` input override?** Default: no — short SHA is unambiguous and avoids accidentally publishing an inconsistent label. Easy to add later if a use case appears.
