// demo-preview entry: the followed artist/label/playlist lists on the Settings
// "Following" tab are not scroll containers. Seeds the follow through the
// public API only (no DB access), so it runs unchanged against the remote
// Railway preview. Otherwise identical to followed-lists-local.js.

const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedTracks } = require('../lib/seed')
const { seedFollowViaApi } = require('../lib/follow-popup-seed')
const { gotoFollowedArtists, assertFollowedListIsNotScrollContainer } = require('../lib/followed-lists-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const userId = await resolveTestUserId()
    await seedTracks({ userIds: [userId] })
    await seedFollowViaApi(page)
    await gotoFollowedArtists(page)
    return { page, timeout: 30000 }
  },
  'followed artists list grows with its contents instead of scrolling': assertFollowedListIsNotScrollContainer,
})
