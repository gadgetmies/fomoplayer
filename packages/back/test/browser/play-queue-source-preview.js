// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// Next follows the list a track was started from, not the list on screen: a track started from Discover · Recent steps
// through Recent while a cart is on screen, also after the page is reloaded, and a track started from Heard keeps
// stepping through Heard. The tracks and the cart are seeded through the API, the same way in both demos.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedPlayQueueSourceViaApi } = require('../lib/play-queue-source-seed')
const { playFromRecent } = require('../lib/one-player-steps')
const {
  assertNextWithCartOnScreenFollowsRecent,
  assertNextAfterReloadFollowsRecent,
  assertNextFromHeardKeepsStepping,
} = require('../lib/play-queue-source-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedPlayQueueSourceViaApi(page)
    const { order } = await playFromRecent(page)
    return { page, order, timeout: 60000 }
  },

  'next with a cart on screen plays the next track of Discover · Recent': assertNextWithCartOnScreenFollowsRecent,
  'after a reload, next still follows Discover · Recent': assertNextAfterReloadFollowsRecent,
  'a track started from Heard keeps stepping through Heard': assertNextFromHeardKeepsStepping,
})
