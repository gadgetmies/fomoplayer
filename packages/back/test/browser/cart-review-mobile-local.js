// Local demo (demo-test workflow): reviewing a cart on a phone by swiping. Seeds through the API with the desktop
// session (the same seeding as cart-review-local.js), then turns review on in the touch-enabled Pixel 5 context and
// swipes rows right to accept and left to reject. The local and preview tests are identical apart from this comment.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedCartReviewViaApi } = require('../lib/cart-review-seed')
const steps = require('../lib/cart-review-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page: desktopPage } = await getSharedContext()
    const { cart } = await seedCartReviewViaApi(desktopPage)
    const { page } = await getMobileContext()
    await steps.openCartAndTurnOnReview(page, cart)
    return { page, timeout: 60000 }
  },

  'Modify accepted offers no Open in a store on a phone': steps.noOpenInStoresOnPhones,
  'swiping a row right past the threshold accepts it': steps.swipeRightAccepts,
  'swiping an accepted row right stops short and says so': steps.swipeTowardTheCurrentStateStopsShort,
  'a short swipe changes nothing': steps.shortSwipeChangesNothing,
  'swiping a row left rejects it, and Undo puts it back': steps.swipeLeftRejectsAndUndo,
})
