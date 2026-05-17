# Fomo Player — Safari Extension (source bundle)

This zip contains the Fomo Player Safari Web Extension as a source bundle. You build and install it on your own Mac using Xcode and a free Apple ID. There is no `.app` installer because Safari requires extensions to be signed, and signing has to happen on your machine with your own Apple ID.

## What you need

- A Mac.
- **Xcode** — free from the Mac App Store, around 7 GB. Open Xcode once after installing so it finishes its first-run setup.
- An **Apple ID** signed into Xcode. Open Xcode → Settings → Accounts → "+" → Apple ID. The default "Personal Team" attached to your Apple ID is enough; you do **not** need a paid Apple Developer membership.
- **Safari 16.4 or newer.**

## What's in this zip

```
fomo-player-safari-source-<version>/
  Fomo Player/                 ← the Xcode project + native host app
  build/
    safari/                    ← the web extension files (manifest, scripts, assets)
  README.md                    ← this file
```

The Xcode project references files inside `build/safari/` via relative paths, so **keep `Fomo Player/` and `build/` at the same level** — don't move them around individually.

## Build & install (one-time, ~2 minutes)

1. Unzip the bundle anywhere convenient (e.g. `~/Downloads/fomo-player-safari-source/`).
2. In Finder, open `Fomo Player/Fomo Player.xcodeproj`. Xcode launches with the project loaded.
3. In the project navigator (left sidebar), click the blue **Fomo Player** project icon at the top.
4. In the editor area, select the **`Fomo Player (macOS)`** target → **Signing & Capabilities** tab.
5. Make sure **"Automatically manage signing"** is checked. From the **Team** dropdown, pick your Apple ID's "Personal Team" (or any team you have access to). If Xcode shows a "Bundle Identifier is not available" warning, change the Bundle Identifier to something unique like `com.<your-name>.Fomo-Player` — then repeat the change with `.Extension` on the next step.
6. Select the **`Fomo Player Extension (macOS)`** target and repeat step 5 for it. Both targets need a team selected. If you changed the app's bundle ID above, change the extension's bundle ID to match (with `.Extension` at the end).
7. At the top of the Xcode window, make sure the active scheme is **`Fomo Player (macOS)`** and the destination is **My Mac**.
8. Press **⌘R** (or Product → Run). Xcode builds, signs with your Personal Team certificate, launches the host app, and registers the extension with Safari.
9. The host app window opens. Click the **"Quit and Open Safari Extensions Settings…"** button. Safari opens to the Extensions pane.
10. In Safari → Settings → Extensions, toggle **Fomo Player** on. Grant the per-site permissions Safari prompts for (Beatport, Bandcamp).

You can now close Xcode. The extension stays installed.

## Caveats

- **The signature expires every 7 days.** Personal Team provisioning profiles are short-lived. After ~7 days the extension stops loading. To refresh: open the project in Xcode, press ⌘R again. (No need to re-toggle anything in Safari afterwards.) If you want to skip the weekly refresh, you need a paid Apple Developer membership ($99/yr).
- **The host app is required.** Safari Web Extensions on macOS live inside a host `.app`; you can't have the extension without the app being present. Don't move or delete the built `Fomo Player.app` after install. (Xcode places it in `~/Library/Developer/Xcode/DerivedData/…/Build/Products/Debug/`.)
- **Reinstall path:** if Safari shows the extension as broken or it disappears, the simplest fix is to re-run ⌘R in Xcode.
- **Uninstalling:** drag the built `Fomo Player.app` to the Trash and Safari will remove the extension.

## Updating to a new release

Download the new source bundle, unzip it over (or alongside) the old one, open the new Xcode project, and ⌘R. You'll be re-using the same Bundle Identifier so Safari treats it as an update rather than a separate install.

## Why a source bundle and not an installer

Apple gates the Safari extension APIs (`SFSafariExtensionManager`, plugin registration) on a trusted code signature. A `.app` signed ad-hoc in CI (i.e. without a paid Apple Developer membership) doesn't satisfy that gate — Safari refuses to surface or operate the extension. Distributing source means each user signs locally with their own Apple ID, which Safari trusts. The trade-off is the 7-day refresh, but no `$99/yr` requirement on our side and no signing secrets in our CI.

## Trouble?

- "Allow Unsigned Extensions" toggle (Safari → Develop menu) is **not** needed for builds signed with your Personal Team. If you do need to toggle it (e.g. you signed ad-hoc), it resets every Safari restart — that's why we don't recommend that path.
- If ⌘R fails with a signing error like "No signing certificate found", make sure Xcode is signed into your Apple ID (Settings → Accounts) and that you've picked a team in step 5/6 above.
- If the extension doesn't show up in Safari → Settings → Extensions, verify the host app actually opened (the dock should have its icon). If it didn't, the build failed silently — check Xcode's issue navigator.
