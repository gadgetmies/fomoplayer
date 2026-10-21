// Preview demo (demo-preview workflow): runs against the deployed Railway PR
// preview with no direct DB access. The "Scroll to current" button only needs
// some tracks to exist; seedTracks branches on PREVIEW_URL (POST /api/me/tracks
// here) so the seeding line is shared with the local test.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const {
  gotoTracksAndPlayFirst,
  assertButtonCentredAtTop,
  assertButtonStaysPinnedWhileScrolling,
  assertClickingButtonScrollsBackToCurrent,
} = require('../lib/scroll-to-current-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await gotoTracksAndPlayFirst(page)
    return { page, timeout: 30000 }
  },

  '"Scroll to current" button is centred over the track list when the playing track is above the view':
    assertButtonCentredAtTop,
  'button stays pinned to the top of the track list while scrolling': assertButtonStaysPinnedWhileScrolling,
  'clicking the button scrolls the playing track back into view': assertClickingButtonScrollsBackToCurrent,
})
