---
name: demo-tests
description: >-
  Use whenever you implement or modify a feature that changes the Fomo Player
  UI (front-end pages/components, admin views, extension popup, mobile/touch
  gestures). It is a BLOCKING requirement for such work: you must add a paired
  demo-test (local) and demo-preview browser test, written to share as much code
  as possible, so the PR Demo workflows record a preview video of the feature.
  Trigger on: "add/change a page", "new button/view/setting", "tweak the
  player UI", or any PR whose diff touches packages/front, admin views, or the
  browser-extension UI.
---

# Demo tests & demo previews

Every feature that changes the UI must ship with **two committed browser tests**
that double as **demo recordings**: a `demo-test` (recorded against a backend
spun up inside the CI runner) and a `demo-preview` (recorded against the live
Railway PR preview). Adding the matching fenced block to the PR body launches
the workflow that produces the preview video.

This is not optional polish — it is how this repo demonstrates a UI change. If
your change is visible in the app, it needs both recordings.

## The two workflows and what triggers them

| File | PR-body trigger block | Runs against | State setup allowed |
|------|----------------------|--------------|---------------------|
| `.github/workflows/pr-demo-local.yml` | ` ```demo-test ` | backend + Postgres inside the runner | UI/API **or** direct DB (`pg`) |
| `.github/workflows/pr-demo-preview.yml` | ` ```demo-preview ` | the deployed Railway PR preview | UI/API only — **no DB access** |

Both jobs only run for `OWNER`/`COLLABORATOR` PRs, extract a committed test
path from the fenced block, and run it with video recording via
`yarn ci:demo <dir> --regex <file>`. They upload the `.webm` and comment on the
PR. The preview job additionally logs in keyless via GitHub Actions OIDC (the
`preview-admin` environment grants the bot admin), so demo-preview tests can
reach `/admin` endpoints.

Add **both** blocks to the PR body, each naming the committed test path relative
to `packages/back/`:

````
```demo-test
test/browser/<feature>-local.js
```

```demo-preview
test/browser/<feature>-preview.js
```
````

## Golden rule: maximize shared code, isolate only the seeding

The local and preview tests must be **as identical as possible**. The *only*
thing that legitimately differs between them is **how the initial state is
seeded**, because the preview has no DB. Everything else — navigation, clicks,
assertions, waits — lives in one shared module that both entry files call.

Factor a feature into three pieces:

1. **`test/lib/<feature>-steps.js`** — all browser interactions and assertions,
   environment-agnostic. Imported by both entry files. This is where the bulk
   of the code lives.
2. **`test/lib/<feature>-seed.js`** (only if the feature needs custom state) —
   export a `seedViaUi(page)` / `seedViaApi(page)` used by *both*, and a
   `seedViaDb()` fallback used *only* by the local test when UI/API seeding is
   impractical.
3. **Two thin entry files** under `test/browser/`:
   - `<feature>-local.js` → the `demo-test` target
   - `<feature>-preview.js` → the `demo-preview` target

   They should be near-identical, differing on a single seeding call. Reuse the
   shared steps object verbatim.

The canonical example already in the tree is the admin Radiator pair —
`admin-radiator-local.js` and `admin-radiator-preview.js` are each ~25 lines and
differ only in `seedRadiatorPresets/runRadiatorJobs` `ViaDb` vs `ViaApi`; all
steps live in `test/lib/admin-radiator-steps.js` and all seeding in
`test/lib/radiator-mock.js`. Copy that shape.

### State-setup policy (what the user asked for)

- **demo-preview: initialise state through the UI.** Drive the actual
  user-facing flow with clicks/typing where one exists. Where there is no UI for
  the setup, use the public/authenticated **API through the browser session**
  (`page.evaluate(() => fetch(...))` so the session cookie is sent — see
  `radiator-mock.js`'s `postViaBrowser`). **Never** touch the DB here; the
  preview is remote and `pg` is unreachable.
- **demo-test: prefer the same UI/API setup so it shares code with the preview
  test.** Only drop to direct DB seeding (`require('../lib/db').pg`) when
  UI/API setup is genuinely impractical, and keep it confined to a `seedViaDb`
  helper so the rest of the test stays shared.

Prefer a single shared `seedViaUi`/`seedViaApi` used by both files — that is the
lowest-duplication outcome. Reach for `seedViaDb` only as a local-only fallback.

### Getting tracks into the database: follow an artist/label in Settings

When a test needs tracks present, the best UI-driven way to get them is to
**follow an artist or label from the Settings page** — this is the real
ingestion path a user takes, it works identically on local and preview (so the
same code seeds both), and it produces a recording that doubles as a genuine
"follow → tracks appear" demo. Prefer this over lower-level seeding when the
feature under test just needs some tracks to exist.

Use the dedicated `seedTracks({ userIds })` helper only when you need a fixed,
deterministic fixture set and the follow flow would be too slow or flaky for the
assertion; use direct DB seeding only as the local-only last resort described
above.

## Use the shared harness — it already handles both environments

`test/lib/setup.js` branches on `isRemotePreview = Boolean(PREVIEW_URL)` for you.
Build on these so a test runs unchanged in both environments:

- `getSharedContext()` → `{ page, ... }`, logged in (password locally, OIDC on
  preview), onboarding dismissed, on `/tracks/recent`.
- `teardownSharedContext` → pass as the suite `teardown` so the video flushes
  (Playwright only writes the `.webm` when the context closes).
- `getMobileContext()` → touch-enabled Pixel-5 context reusing the session, for
  swipe/mobile-only features (see `swipe-mark-heard.js`).
- `dismissOnboarding(page)`, `waitForWithTimeoutMessage(op, message)` — always
  wrap `waitFor`/`waitForSelector` with a descriptive message; the demo videos
  and failures read far better for it.
- `seedTracks({ userIds })` and `resolveTestUserId()` (from `test/lib/seed.js` /
  `test-user.js`) already branch on `PREVIEW_URL` (DB locally, `/api/me/tracks`
  + `/api/auth/me` on preview). Use them directly in both tests — do not
  re-implement track seeding per environment.

Recording treatment (slow-mo `PW_SLOWMO=600`, cursor/click/keyboard overlay,
1280×720 `.webm`) is applied automatically by `setup.js` whenever `VIDEO_DIR` or
`PREVIEW_URL` is set. You do not configure recording in the test — just write
clear, deliberate steps that look good slowed down.

## Test file shape (cascade-test)

```js
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedTracks } = require('../lib/seed')
const { seedViaUi } = require('../lib/<feature>-seed')      // shared, UI/API driven
const { gotoFeature, assertFeatureWorks } = require('../lib/<feature>-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await seedViaUi(page)            // preview file: identical line
    await gotoFeature(page)
    return { page, timeout: 30000 }
  },
  'feature renders and behaves correctly': assertFeatureWorks,
})
```

The `-local.js` file is the same, except it may swap `seedViaUi` for a
`seedViaDb` fallback if (and only if) UI/API seeding isn't feasible there.

## Both files also run in normal browser CI

`<feature>-local.js` and `<feature>-preview.js` live in `test/browser/`, so the
regular `ci:test:browser` job runs them too (no `PREVIEW_URL`, no recording).
They must be **green there as well**, not only in the demo workflows. Since the
preview test's API/UI seeding works against a local backend (CI grants the test
user admin via `ADMIN_USER_SUBS`), keep its setup runnable locally.

## Run locally before committing

```bash
# Plain pass (both envs simulated locally, no video):
NODE_ENV=ci yarn build                     # build front-end into packages/back/public first
yarn workspace fomoplayer_back ci:test:browser --regex '<feature>-local\.js$'
yarn workspace fomoplayer_back ci:test:browser --regex '<feature>-preview\.js$'

# Record a demo locally (writes a .webm, applies slow-mo + overlay):
cd packages/back
VIDEO_DIR="$PWD/demo-output" PW_SLOWMO=600 \
  yarn ci:demo test/browser --regex '<feature>-local\.js$'
```

Confirm a non-empty `.webm` lands in `demo-output/` — a zero-byte file means the
context never closed (use `teardownSharedContext` as the suite `teardown`).

## Checklist before opening the PR

- [ ] Shared steps/assertions in `test/lib/<feature>-steps.js`.
- [ ] `<feature>-local.js` and `<feature>-preview.js` differ only in seeding.
- [ ] demo-preview seeds via UI/API only (no DB); demo-test reuses that, with
      `seedViaDb` only as a justified local fallback.
- [ ] Both pass under `ci:test:browser` and record a non-empty `.webm`.
- [ ] PR body contains both ` ```demo-test ` and ` ```demo-preview ` blocks
      naming the committed paths.
- [ ] No deployment hostnames hard-coded (see CLAUDE.md) — the harness supplies
      `PREVIEW_URL`; tests may use `fomoplayer.com` only as a fixture string.
