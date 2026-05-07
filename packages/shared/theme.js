// Fomo Player brand-primary token cluster.
//
// Mirror file: ./theme.css — keep these values and the CSS custom
// properties under `:root` (named `--fp-brand-primary`, etc.) in
// sync. Any palette tweak must update both files.
//
// JS context: shadow-DOM `<style>` template strings in the browser
// extension (e.g. content/bandcamp/cart-button.js, inject.js) and
// JS prop values that need a colour string (e.g. front/Preview.js's
// `<Progress barColor=...>`). Use bare-specifier import:
// `const { colors } = require('fomoplayer_shared/theme')` — plain
// CommonJS so `babel-loader`'s `node_modules` exclude doesn't break
// the extension build.

const colors = {
  brandPrimary: '#b40089',
  brandPrimaryHover: '#9f0076',
  brandPrimaryBorder: '#530059',
  brandPrimaryActive: '#6e0069',
  brandPrimaryDisabled: '#b5b5b5',
  brandPrimaryDisabledBorder: '#7c7c7c',
  brandPrimaryActiveRing: 'rgba(180, 0, 137, 0.25)',
  brandPrimaryActiveTint: 'rgba(180, 0, 137, 0.18)',
}

module.exports = { colors }
