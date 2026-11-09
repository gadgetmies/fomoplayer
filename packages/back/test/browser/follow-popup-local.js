// demo-test entry: the follow popup's button reflects the follow state.
// Seeds the follow through the DB because following via the API calls the
// authenticated Beatport API, which the CI runner cannot reach. Otherwise
// identical to follow-popup-preview.js.

const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedTracks } = require('../lib/seed')
const { seedFollowViaDb } = require('../lib/follow-popup-seed')
const { openFollowPopupForFollowedTrack, assertFollowButtonReflectsState } = require('../lib/follow-popup-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await seedFollowViaDb(userId)
    await openFollowPopupForFollowedTrack(page)
    return { page, timeout: 30000 }
  },
  'follow popup lists active stores and flips the button on unfollow': assertFollowButtonReflectsState,
})
