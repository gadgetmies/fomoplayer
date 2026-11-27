// Local demo (demo-test workflow): how a cart under review looks on a desktop. Seeds the demo cart through the API with
// the browser session (the same seeding as cart-review-local.js), then shows the Review switch standing out from the
// cart bar while off, and accepted and rejected tracks dimmed in the All tab (only rejected ones struck through), at
// full strength while playing and in the Accepted tab, and their cart popups opening on top at full strength. The local
// and preview tests are identical apart from this comment.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedCartReviewViaApi } = require('../lib/cart-review-seed')
const steps = require('../lib/cart-review-looks-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const { cart } = await seedCartReviewViaApi(page)
    await steps.openCart(page, cart)
    return { page, timeout: 60000 }
  },

  'the Review switch shows its track on the cart bar while off': steps.reviewSwitchVisibleWhileOff,
  'turning review on opens the All tab': steps.turnOnReview,
  'accepting and rejecting tracks from their rows': steps.acceptAndRejectInAllTab,
  'the All tab dims accepted and rejected tracks and strikes only the rejected through':
    steps.decidedTracksDimmedInAllTab,
  'the Accepted tab shows the accepted tracks at full strength': steps.acceptedTabIsNotDimmed,
  'the cart popup of a rejected track opens on top at full strength': steps.hoverCartPopupOfRejectedRow,
  'the cart popup of an accepted track opens on top at full strength': steps.hoverCartPopupOfAcceptedRow,
  'a playing accepted track is at full strength': steps.playingAcceptedTrackIsBright,
})
