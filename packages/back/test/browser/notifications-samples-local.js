// Local demo (demo-test workflow): runs against a backend in the same runner.
// The same steps as notifications-samples-preview.js, plus the ones that need a fingerprint match and embeddings,
// which only the analyser writes: a match listed in Matches with the main track list's track info, playing a sample
// without opening it, Sounds like listed as similarity search results with the audio distance they share, and
// following a Sounds like suggestion. The test server has no object storage, so the samples are inserted through the
// DB instead of uploaded.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { resolveTestUserId } = require('../lib/test-user')
const { seedOnePlayerTracksViaApi } = require('../lib/one-player-seed')
const { seedSamplesViaDb, removeDemoSamplesViaApi } = require('../lib/notifications-samples-seed')
const steps = require('../lib/notifications-samples-steps')

test({
  teardown: async () => {
    const { page } = await getSharedContext()
    await removeDemoSamplesViaApi(page)
    await teardownSharedContext()
  },
  setup: async () => {
    const { page } = await getSharedContext()
    await seedOnePlayerTracksViaApi(page)
    const ids = await seedSamplesViaDb(page, await resolveTestUserId())
    const { page: mobilePage } = await getMobileContext()
    return { page, mobilePage, ids, timeout: 45000 }
  },

  'opening a sample shows its content under it and closes the other': steps.assertOpeningASampleClosesTheOther,
  'the open sample switches between Matches and Sounds like': steps.assertMatchesAndSoundsLikeToggle,
  'a cancelled delete keeps the sample': steps.assertCancelledDeleteKeepsSample,
  'a link opens the sample it names': steps.assertLinkOpensSample,
  'a confirmed delete removes the sample': steps.assertConfirmedDeleteRemovesSample,
  'on a phone the tab fits the screen': steps.assertPhoneLayoutFits,
  'a match is listed with the track info, its details in the row on a phone': steps.assertMatchListed,
  'play leaves the sample closed': steps.assertPlayDoesNotOpenSample,
  'Sounds like lists the tracks as a similarity search does': steps.assertSoundsLikeShowsTrackInfo,
  'a similarity search shows the same audio distance': steps.assertSimilaritySearchShowsDistance,
  'following a Sounds like suggestion removes it': steps.assertFollowingASuggestionRemovesIt,
})
