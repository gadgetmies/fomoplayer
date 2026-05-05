## 1. Add the watch driver

- [x] 1.1 Create `packages/browser-extension/utils/watch.js` that
      parses `BROWSERS` (default `chrome`), trims and filters
      empty entries, validates each against `chrome` / `firefox`,
      and rejects `safari` / unknown values with a single-line
      error and a non-zero exit.
- [x] 1.2 For each requested browser, set `process.env.BROWSER =
      browser` and `process.env.NODE_ENV = 'development'`,
      cache-bust `require.cache[require.resolve('../webpack.config.js')]`,
      then require the config, delete its
      `chromeExtensionBoilerplate` field (mirroring `utils/build.js`),
      and tag `cfg.name = browser` so child compilers report
      themselves.
- [x] 1.3 Pass the array of configs to `webpack(configs)` and call
      `compiler.watch({}, callback)`. In the callback, print a
      `[<browser>] ` prefix in front of each child compilation's
      stats summary (and any errors / warnings), using
      `compiler.compilers[i].name` for the prefix.
- [x] 1.4 Install `SIGINT` / `SIGTERM` handlers that call
      `compiler.close()` (or `compiler.watching.close()`) and exit
      with status 0.

## 2. Wire scripts and docs

- [x] 2.1 In `packages/browser-extension/package.json`, add:
      `"watch": "node utils/watch.js"`,
      `"watch:chrome": "BROWSERS=chrome node utils/watch.js"`,
      `"watch:firefox": "BROWSERS=firefox node utils/watch.js"`,
      `"watch:all": "BROWSERS=chrome,firefox node utils/watch.js"`.
- [x] 2.2 Add a "Watch mode" subsection to
      `packages/browser-extension/README.md` between "Build" and
      "Loading the extension during development" describing the
      scripts, the `BROWSERS` env contract, the Safari exclusion,
      and the manual-reload-after-rebuild note.

## 3. Verify

- [x] 3.1 Run `BROWSERS=chrome yarn watch` for ~10 seconds, save a
      change to a source file, and confirm that `build/chrome/`
      gets rewritten with a `[chrome] ` summary line in the log.
      Ctrl-C should exit cleanly. (Verified: initial compile in
      ~1.3s, incremental rebuild on `touch src/js/popup.js` in
      ~50ms, both lines prefixed `[chrome]`, SIGINT closes
      cleanly.)
- [x] 3.2 Run `BROWSERS=chrome,firefox yarn watch` and confirm
      both `build/chrome/` and `build/firefox/` get rewritten on a
      single source save, with `[chrome] ` and `[firefox] ` log
      prefixes. (Verified: both targets emit prefixed summary
      lines in the same MultiCompiler tick.)
- [x] 3.3 Run `BROWSERS=safari yarn watch` and confirm the error
      message names the supported set and the script exits with a
      non-zero code. (Verified: exit 1 with the Safari-specific
      message; `BROWSERS=opera` also exits 1 with the
      supported-set message.)
- [x] 3.4 Run `yarn build:chrome` afterwards and confirm the
      production build is unchanged. (Verified: `manifest.json`
      and the seven bundle files written to `build/chrome/`,
      compile reported "successfully".)
- [x] 3.5 Ask the user to load `build/chrome/` unpacked, run
      `yarn watch`, edit a source file, hit "reload" on the
      extensions page, and confirm the change shows up. (Verified
      2026-05-05; user accepted the smoke-test record in lieu of
      a manual UI gate, since the change is dev-only tooling with
      no UI surface.)

## 4. Wrap up

- [x] 4.1 After explicit user verification, commit the change with
      all relevant files (utils/watch.js, package.json scripts,
      README, OpenSpec change).
- [x] 4.2 Archive the OpenSpec change via `/opsx:archive`.
- [x] 4.3 Move backlog item 019 from "Todo" into "Done" in
      `backlog/INDEX.md` and flip its frontmatter `status` to
      `done`.
