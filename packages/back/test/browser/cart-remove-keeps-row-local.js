// Local demo (demo-test workflow): drives a backend running in the same environment. The tracks are seeded the
// same way as in the preview demo (seedTracks branches on PREVIEW_URL), so the two files differ only in this comment.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedTracks } = require('../lib/seed')
const { resolveTestUserId } = require('../lib/test-user')
const {
  addFirstRecentTrackToDefaultCart,
  assertRemovedTrackStaysListedWithAddButton,
  assertAddButtonPutsTheTrackBack,
  assertRemovedTrackIsGoneAfterReload,
} = require('../lib/cart-remove-keeps-row-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    const trackTitle = await addFirstRecentTrackToDefaultCart(page)
    return { page, trackTitle, timeout: 30000 }
  },

  'a track removed from the cart on screen stays listed with an add button': assertRemovedTrackStaysListedWithAddButton,
  'the add button puts the track back in the cart': assertAddButtonPutsTheTrackBack,
  'a removed track is no longer listed once the cart reloads': assertRemovedTrackIsGoneAfterReload,
})
