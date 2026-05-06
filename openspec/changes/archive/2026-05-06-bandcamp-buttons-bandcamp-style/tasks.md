## 1. cueButton (Play / Queue)

- [x] 1.1 `cueButton` in `packages/browser-extension/src/js/content/bandcamp/inject.js` now sets `background: rgba(0, 0, 0, 0.75); color: #fff; border: 1px solid transparent; border-radius: 2px;` on the idle `button` rule.
- [x] 1.2 `button:hover:not(:disabled)` keeps `background: ${colors.brandPrimary}; color: #fff;` — unchanged.
- [x] 1.3 `button[data-state="error"]` updated to `background: rgba(0, 0, 0, 0.75); border-color: #c63; color: #c63;` so the error flash sits on the same dark fill as the idle state.

## 2. renderCartButton (Add-to-Fomo toggle)

- [x] 2.1 `renderCartButton`'s `STYLE` constant in `cart-button.js` updated: `button.toggle` now uses `background: rgba(0, 0, 0, 0.75); color: #fff; border: 1px solid transparent; border-radius: 2px;`.
- [x] 2.2 `button.toggle:hover` keeps `background: ${colors.brandPrimary}; color: #fff;` — unchanged.

## 3. Verification

- [x] 3.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles cleanly.
- [x] 3.2 `yarn test` — 13 specs pass.
