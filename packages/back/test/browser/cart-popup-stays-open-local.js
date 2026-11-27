// Local demo (demo-test workflow): runs against a backend in the same runner. The cart popup demo only needs some
// tracks to exist; seedTracks branches on PREVIEW_URL (direct DB here) so the seeding line is shared with the preview
// test.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { cases } = require('../lib/cart-popup-stays-open-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const { page: phonePage } = await getMobileContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    return { page, phonePage, timeout: 60000 }
  },
  ...cases,
})
