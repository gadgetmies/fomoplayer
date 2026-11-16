// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The top bar search across navigation: its icon, Settings keeping the search with a way back, back showing the
// search at once, and Discover emptying the bar. Tracks are seeded through the API, the same in both demos.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const {
  openDiscover,
  assertSearchIconShownAndCentred,
  assertSettingsKeepsSearchWithWayBack,
  assertBackShowsSearchAtOnce,
  assertOtherListClearsSearch,
} = require('../lib/search-bar-navigation-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    await openDiscover(page)
    return { page, timeout: 60000 }
  },

  'the search icon shows, centred, with and without focus': assertSearchIconShownAndCentred,
  'Settings keeps the search and offers a way back to its results': assertSettingsKeepsSearchWithWayBack,
  'going back to a search shows its terms before the results arrive': assertBackShowsSearchAtOnce,
  'Discover empties the search bar': assertOtherListClearsSearch,
})
