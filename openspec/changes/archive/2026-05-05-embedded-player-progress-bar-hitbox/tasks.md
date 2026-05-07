## 1. CSS update

- [x] 1.1 `.bar` now has `height: 16px; background: transparent` (was `height: 4px; background: #2c2c2c`); `cursor: pointer; position: relative; flex: 1` carry over.
- [x] 1.2 New `.bar::before` rule paints the visible 4px stripe centred via `top: 50%; transform: translateY(-50%);` with the original `#2c2c2c` background.
- [x] 1.3 `.bar-fill` switched to `top: 50%; transform: translateY(-50%); height: 4px;` (replacing `top: 0; bottom: 0;`) so the brand-coloured fill remains a 4px band aligned with the visible stripe; existing `width` percentage from `refs.barFill.style.width` continues to drive the progress.

## 2. Verification

- [x] 2.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles cleanly in ~3s, no CSS / lint regressions.
- [x] 2.2 `yarn test` — 13 specs pass; no progress-bar-specific tests, but the suite stays green.
- [x] 2.3 Visual check: the painted stripe stays 4px tall (via the new `::before`), the `.bar` element itself is 16px tall and centred in the player row. Time-label flank columns are unaffected because `.progress`'s flex `align-items: center` already centred children on the row baseline.
