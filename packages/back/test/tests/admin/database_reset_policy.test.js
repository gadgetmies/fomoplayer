const assert = require('assert')
const { test } = require('cascade-test')
const { isDatabaseResetAllowed } = require('../../../routes/admin/database-reset-policy')

test({
  'isDatabaseResetAllowed': {
    'allows reset in a preview environment': () =>
      assert.strictEqual(isDatabaseResetAllowed({ isPreviewEnv: true }), true),
    // Preview runs with NODE_ENV=production (isProduction true) — the feature
    // must still be available there, gated only on isPreviewEnv.
    'allows reset in preview even when isProduction is true': () =>
      assert.strictEqual(isDatabaseResetAllowed({ isPreviewEnv: true, isProduction: true }), true),
    'denies reset when not a preview environment': () =>
      assert.strictEqual(isDatabaseResetAllowed({ isPreviewEnv: false, isProduction: true }), false),
    'denies reset when isPreviewEnv is unset': () => {
      assert.strictEqual(isDatabaseResetAllowed({}), false)
      assert.strictEqual(isDatabaseResetAllowed(), false)
    },
    'requires the strict boolean true (no truthy coercion)': () => {
      assert.strictEqual(isDatabaseResetAllowed({ isPreviewEnv: 'true' }), false)
      assert.strictEqual(isDatabaseResetAllowed({ isPreviewEnv: 1 }), false)
    },
  },
})
