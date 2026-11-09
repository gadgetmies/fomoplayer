// demo-preview entry: the follow popup's button reflects the follow state.
// Seeds the follow through the public API only (no DB access), so it runs
// unchanged against the remote Railway preview. Otherwise identical to
// follow-popup-local.js.

const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedTracks } = require('../lib/seed')
const { seedFollowViaApi } = require('../lib/follow-popup-seed')
const { openFollowPopupForFollowedTrack, assertFollowButtonReflectsState } = require('../lib/follow-popup-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await seedFollowViaApi(page)
    await openFollowPopupForFollowedTrack(page)
    return { page, timeout: 30000 }
  },
  'follow popup lists active stores and flips the button on unfollow': assertFollowButtonReflectsState,
})
