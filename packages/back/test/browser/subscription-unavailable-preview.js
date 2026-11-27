// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The test user's email is not verified there (verifying needs the emailed link), so subscribing is unavailable.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { assertHoverExplainsOnDesktop, assertTapExplainsOnMobile } = require('../lib/subscription-unavailable-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const { page: mobilePage } = await getMobileContext()
    return { page, mobilePage, timeout: 45000 }
  },

  'hovering "Subscription unavailable" explains why and links to Settings › Email': assertHoverExplainsOnDesktop,
  'tapping the warning icon on mobile explains why': assertTapExplainsOnMobile,
})
