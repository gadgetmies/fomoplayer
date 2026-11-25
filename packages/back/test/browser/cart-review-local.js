// Local demo (demo-test workflow): seeds the demo cart through the API with the browser session, then reviews it on a
// desktop: accept and reject from the rows and the player, narrow to one store, remove the rejected tracks and undo,
// open the accepted ones in their stores and mark them purchased. The local and preview tests are identical apart from this comment.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedCartReviewViaApi } = require('../lib/cart-review-seed')
const steps = require('../lib/cart-review-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const { cart } = await seedCartReviewViaApi(page)
    await steps.openCartAndTurnOnReview(page, cart)
    await steps.showToReview(page)
    return { page, timeout: 60000 }
  },

  'review replaces Find similar with the review tabs and bulk actions': steps.reviewControlsReplaceFindSimilar,
  'accepting a track from its row takes it out of To review': steps.acceptFromRow,
  'rejecting the playing track in the player moves on to the next track to review': steps.rejectPlayingTrackFromPlayer,
  'deciding more tracks from their rows updates the counts': steps.decideMoreFromRows,
  'a store tab narrows the list and the counts': steps.narrowToOneStore,
  'the player offers review only in the cart view': steps.reviewOnlyInTheCartView,
  'the cart is still under review after a reload, on the All tab': steps.reviewSurvivesReload,
  'the rejected tracks can be removed and put back with Undo': steps.removeRejectedAndUndo,
  'Modify accepted opens the accepted tracks in each store': steps.openAcceptedInStores,
  'Modify accepted marks the accepted tracks purchased': steps.markAcceptedPurchased,
})
