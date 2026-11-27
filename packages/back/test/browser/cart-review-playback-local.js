// Local demo (demo-test workflow): seeds two carts through the API with the browser session, then reviews the first one:
// the cart menu of a row shows a change to the other cart, Next on the Accepted tab plays the next accepted track, and
// Next on To review steps over a track removed from the cart. The local and preview tests are identical apart from
// this comment.
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedCartReviewPlaybackViaApi } = require('../lib/cart-review-playback-seed')
const steps = require('../lib/cart-review-playback-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const { cart } = await seedCartReviewPlaybackViaApi(page)
    await steps.openCartAndTurnOnReview(page, cart)
    return { page, timeout: 60000 }
  },

  'the cart menu of a row shows the track taken out of another cart and put back': steps.otherCartInRowMenu,
  'Next on the Accepted tab plays the next accepted track': steps.nextPlaysTheAcceptedTab,
  'Next on To review steps over a track removed from the cart': steps.nextSkipsATrackRemovedFromTheCart,
})
