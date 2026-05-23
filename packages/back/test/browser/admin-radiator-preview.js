// Preview demo (demo-preview workflow): seeds through the public/admin API
// because the test runs against a deployed preview with no direct DB access.
// Requires the session user to be an admin (ADMIN_USER_IDS) on the target
// environment to reach the /admin endpoints.
const { test } = require('cascade-test')
const { getSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { seedRadiatorPresetsViaApi, runRadiatorJobsViaApi } = require('../lib/radiator-mock')
const { gotoRadiator, assertRadiatorShowsSeededData } = require('../lib/admin-radiator-steps')

test({
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
