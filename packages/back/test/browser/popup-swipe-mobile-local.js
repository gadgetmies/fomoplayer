// Local demo (demo-test workflow): runs against a backend in the same runner. The popup swipe demo only needs
// some tracks to exist; seedTracks branches on PREVIEW_URL (direct DB here) so the seeding line is shared with the
// preview test.
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
