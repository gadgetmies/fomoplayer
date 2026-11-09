// Local demo (demo-test workflow): recorded against a backend spun up inside
// the CI runner. Seeds the unsubscribe URL through the logged-in browser
// session (same code path as the preview test) — no direct DB access needed.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedUnsubscribeTokenViaApi } = require('../lib/email-unsubscribe-seed')
const { gotoUnsubscribePage, assertUnsubscribeAndResubscribe } = require('../lib/email-unsubscribe-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const token = await seedUnsubscribeTokenViaApi(page)
    await gotoUnsubscribePage(page, token)
    return { page, timeout: 30000 }
  },

  'no-login unsubscribe page opts out and back in': assertUnsubscribeAndResubscribe,
})
