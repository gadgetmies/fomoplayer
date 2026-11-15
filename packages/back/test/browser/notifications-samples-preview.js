// Preview demo (demo-preview workflow): runs against the deployed Railway PR preview with no direct DB access.
// The Notifications page's Samples tab as an accordion: opening a sample shows its content under its row and closes
// the other, the Matches / Sounds like toggle in the open sample's header, delete with its confirmation, a link that
// opens a given sample, and the phone layout. The samples are uploaded through the API; the local demo also records a
// match, playing a sample and following a Sounds like suggestion, which need DB-seeded matches and embeddings.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedSamplesViaApi, removeDemoSamplesViaApi } = require('../lib/notifications-samples-seed')
const steps = require('../lib/notifications-samples-steps')

test({
  teardown: async () => {
    const { page } = await getSharedContext()
    await removeDemoSamplesViaApi(page)
    await teardownSharedContext()
  },
  setup: async () => {
    const { page } = await getSharedContext()
    const ids = await seedSamplesViaApi(page)
    const { page: mobilePage } = await getMobileContext()
    return { page, mobilePage, ids, timeout: 45000 }
  },

  'opening a sample shows its content under it and closes the other': steps.assertOpeningASampleClosesTheOther,
  'the open sample switches between Matches and Sounds like': steps.assertMatchesAndSoundsLikeToggle,
  'a cancelled delete keeps the sample': steps.assertCancelledDeleteKeepsSample,
  'a link opens the sample it names': steps.assertLinkOpensSample,
  'a confirmed delete removes the sample': steps.assertConfirmedDeleteRemovesSample,
  'on a phone the tab fits the screen': steps.assertPhoneLayoutFits,
})
