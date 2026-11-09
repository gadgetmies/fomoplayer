// Preview demo (demo-preview workflow), run against the Railway PR preview. seedTracks seeds via
// the API there, so this matches icons-local.js line for line.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { tourIconViews } = require('../lib/icons-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedTracks({ userIds: [await resolveTestUserId()] })
    return { page, timeout: 120000 }
  },
  'icons render in the track list, support menu, settings and carts': tourIconViews,
})
