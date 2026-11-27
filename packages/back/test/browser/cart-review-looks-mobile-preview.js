// Preview demo (demo-preview workflow): how a cart under review looks on a phone. Seeds the demo cart through the API with the
// desktop session (the same seeding as cart-review-mobile-preview.js), then in the touch-enabled Pixel 5 context accepts
// and rejects a track in the All tab, checks both are dimmed, and opens each one's cart popup, which must cover the
// whole screen at full strength. The local and preview tests are identical apart from this comment.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedCartReviewViaApi } = require('../lib/cart-review-seed')
const steps = require('../lib/cart-review-looks-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page: desktopPage } = await getSharedContext()
    const { cart } = await seedCartReviewViaApi(desktopPage)
    const { page } = await getMobileContext()
    await steps.openCart(page, cart)
    return { page, timeout: 60000 }
  },

  'the Review switch shows its track on the cart bar while off': steps.reviewSwitchVisibleWhileOff,
  'turning review on opens the All tab': steps.turnOnReview,
  'accepting and rejecting tracks from their rows': steps.acceptAndRejectInAllTab,
  'the All tab dims accepted and rejected tracks and strikes only the rejected through':
    steps.decidedTracksDimmedInAllTab,
  'the cart popup of a rejected track covers the whole screen': steps.cartPopupOfRejectedRowCoversTheScreen,
  'the cart popup of an accepted track covers the whole screen': steps.cartPopupOfAcceptedRowCoversTheScreen,
})
