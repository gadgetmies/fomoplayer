// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The top bar keeping spaces and quotes in an artist / label lookup. Combining picked pills into one subscription needs
// a verified email (verifying needs the emailed link), so the local demo records it.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const { openTopBarSearch, assertTopBarKeepsSpacesInLookup } = require('../lib/entity-search-terms-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    await openTopBarSearch(page)
    return { page, timeout: 45000 }
  },

  'the top bar keeps spaces and quotes in an artist / label lookup': assertTopBarKeepsSpacesInLookup,
})
