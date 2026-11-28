// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access. The
// popup swipe demo only needs some tracks to exist; seedTracks branches on PREVIEW_URL (POST /api/me/tracks here) so
// the seeding line is shared with the local test.
const { test } = require('cascade-test')
const { getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const { gotoTracksAndOpenCartPopup, cases } = require('../lib/popup-swipe-mobile-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getMobileContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await gotoTracksAndOpenCartPopup(page)
    return { page, timeout: 30000 }
  },
  ...cases,
})
