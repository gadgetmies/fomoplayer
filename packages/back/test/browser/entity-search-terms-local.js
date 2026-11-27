// Local demo (demo-test workflow): runs against a backend in the same runner.
// The same top-bar steps as entity-search-terms-preview.js, plus Notifications › Subscriptions, which needs a verified
// email: verifying needs the emailed link, so it is set through the DB here.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const { setEmailVerifiedViaDb } = require('../lib/notifications-page-seed')
const {
  openTopBarSearch,
  assertTopBarKeepsSpacesInLookup,
  assertSubscriptionCombinesPickedPills,
} = require('../lib/entity-search-terms-steps')

test({
  teardown: async () => {
    await setEmailVerifiedViaDb(await resolveTestUserId(), false)
    await teardownSharedContext()
  },
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    await setEmailVerifiedViaDb(await resolveTestUserId(), true)
    await openTopBarSearch(page)
    return { page, timeout: 45000 }
  },

  'the top bar keeps spaces and quotes in an artist / label lookup': assertTopBarKeepsSpacesInLookup,
  'picked artists and labels are combined into one subscription': assertSubscriptionCombinesPickedPills,
})
