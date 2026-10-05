// Preview demo (demo-preview workflow): seeds through the API with the browser session
// (tracks, synthetic embeddings via the admin analyse endpoint, and the demo cart), then walks through the cart
// similarity search. Requires an admin session to reach POST /api/admin/analyse (the preview bot is admin).
const { test } = require('cascade-test')
const { getSharedContext, teardownSharedContext } = require('../lib/setup')
const { seedCartSimilarityViaApi } = require('../lib/cart-similarity-seed')
const steps = require('../lib/cart-similarity-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page } = await getSharedContext()
    const { cart } = await seedCartSimilarityViaApi(page)
    await steps.openCartAndFindSimilar(page, cart)
    return { page, timeout: 90000 }
  },

  'finds tracks similar to the cart, group by group': steps.assertGroupedResults,
  'shows the results on the map behind the Map toggle': steps.toggleMap,
  'focuses on one group and pushes the search away from a result': steps.selectGroupAndMarkNotThis,
  'saves the selected group as a new cart': steps.saveGroupAsCart,
})
