// demo-preview entry: single-row artist/label carousels on the Settings
// "Following" tab (follow search results and purchase-based suggestions), with
// vertical swipes over them scrolling the page. Seeds purchased tracks through
// the public API, which works locally and on the preview, so this file matches
// follow-carousel-local.js apart from this comment.

const { test } = require('cascade-test')
const { getSharedContext, getMobileContext, teardownSharedContext } = require('../lib/setup')
const { seedPurchasedViaApi } = require('../lib/follow-suggestions-seed')
const {
  gotoFollowing,
  assertSuggestionsCarousel,
  assertSearchResultsCarousel,
} = require('../lib/follow-carousel-steps')

test({
  teardown: teardownSharedContext,
  setup: async () => {
    const { page: desktopPage } = await getSharedContext()
    await seedPurchasedViaApi(desktopPage)
    const { page } = await getMobileContext()
    await gotoFollowing(page)
    return { page, timeout: 60000 }
  },
  'follow suggestions are a single-row carousel that lets vertical swipes scroll the page': assertSuggestionsCarousel,
  'follow search results are a single-row carousel that lets vertical swipes scroll the page':
    assertSearchResultsCarousel,
})
