// Local demo (demo-test workflow): the cart similarity search on a phone. Seeds through the API with the
// desktop session (the same seeding as cart-similarity-local.js), then opens the search in the touch-enabled
// Pixel 5 context. The local and preview tests are identical apart from this comment.
const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedCartSimilarityViaApi } = require('../lib/cart-similarity-seed')
const { openCartAndFindSimilar } = require('../lib/cart-similarity-steps')
const steps = require('../lib/cart-similarity-mobile-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page: desktopPage } = await getSharedContext()
    const { cart } = await seedCartSimilarityViaApi(desktopPage)
    const { page } = await getMobileContext()
    await openCartAndFindSimilar(page, cart)
    return { page, timeout: 90000 }
  },

  'fits the search controls into two compact rows': steps.assertCompactControls,
  'stacks Fit, the cart button and Not this in one column': steps.assertActionColumn,
  'scrolls the group chips sideways': steps.scrollChips,
  'steps the number of groups with the buttons and the box': steps.stepGroups,
})
