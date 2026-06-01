// Local demo (demo-test workflow): seeds the database directly, since the test
// drives a backend running in the same environment.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { seedRadiatorPresetsViaDb, runRadiatorJobsViaDb } = require('../lib/radiator-mock')
const { gotoRadiator, assertRadiatorShowsSeededData } = require('../lib/admin-radiator-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await seedRadiatorPresetsViaDb()
    await runRadiatorJobsViaDb()
    await gotoRadiator(page)
    return { page, timeout: 30000 }
  },

  'seeded radiator preset renders chart data in the local environment': assertRadiatorShowsSeededData,
})
