// Local demo (demo-test workflow): runs against a backend in the same runner.
// The same steps as subscription-unavailable-preview.js; the test user's email is made unverified through the DB here
// (on the preview it already is: verifying needs the emailed link).
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { setEmailVerifiedViaDb } = require('../lib/notifications-page-seed')
const { assertHoverExplainsOnDesktop, assertTapExplainsOnMobile } = require('../lib/subscription-unavailable-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await setEmailVerifiedViaDb(await resolveTestUserId(), false)
    const { page: mobilePage } = await getMobileContext()
    return { page, mobilePage, timeout: 45000 }
  },

  'hovering "Subscription unavailable" explains why and links to Settings › Email': assertHoverExplainsOnDesktop,
  'tapping the warning icon on mobile explains why': assertTapExplainsOnMobile,
})
