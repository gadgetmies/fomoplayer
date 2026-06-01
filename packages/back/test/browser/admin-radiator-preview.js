// Preview demo (demo-preview workflow): seeds through the public/admin API
// because the test runs against a deployed preview with no direct DB access.
// Requires the session user to be an admin on the target environment to reach
// the /admin endpoints (the preview Actions bot is granted admin from its OIDC
// sub; otherwise ADMIN_USER_SUBS must list the user's subject).
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { seedRadiatorPresetsViaApi, runRadiatorJobsViaApi } = require('../lib/radiator-mock')
const { gotoRadiator, assertRadiatorShowsSeededData } = require('../lib/admin-radiator-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await seedRadiatorPresetsViaApi(page)
    await runRadiatorJobsViaApi(page)
    await gotoRadiator(page)
    return { page, timeout: 30000 }
  },

  'seeded radiator preset renders chart data in the preview environment': assertRadiatorShowsSeededData,
})
