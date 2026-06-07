// demo-preview entry: purchased-cart follow suggestions on the Settings page.
// Seeds purchased tracks through the public API only (no DB access), so it runs
// unchanged against the remote Railway preview. Identical to
// follow-suggestions-local.js apart from this comment — all behaviour lives in
// the shared steps/seed modules.

const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedPurchasedViaApi } = require('../lib/follow-suggestions-seed')
const { gotoFollowSuggestions, assertSuggestionsRenderAndIgnore } = require('../lib/follow-suggestions-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedPurchasedViaApi(page)
    await gotoFollowSuggestions(page)
    return { page, timeout: 30000 }
  },
  'purchased-cart follow suggestions render and can be ignored': assertSuggestionsRenderAndIgnore,
})
