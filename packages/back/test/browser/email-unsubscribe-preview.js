// Preview demo (demo-preview workflow): recorded against the deployed Railway
// PR preview, which has no direct DB access. Seeds the unsubscribe URL through
// the logged-in browser session (public authenticated API) — identical to the
// local test; only this comment and the filename differ.
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
