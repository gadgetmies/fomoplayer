const assert = require('assert')
const { test } = require('cascade-test')

const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api.js')
const { resetRateLimit, resetReleaseIndex } = bandcampApi.static

// A release page that is neither a challenge nor a real release (here a page with no data-tralbum) used to crash
// with "Cannot read properties of null (reading 'getAttribute')". The release is not listed on the stubbed /music
// page, so fetchRelease falls back to scraping the release page itself.
const NOT_A_RELEASE_PAGE = '<!DOCTYPE html><html><head><title>Something else</title></head><body></body></html>'

test({
  'a release page without release data fails with an error naming the missing element': async () => {
    resetRateLimit()
    resetReleaseIndex()
    const original = global.fetch
    global.fetch = async () =>
      new Response(NOT_A_RELEASE_PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    try {
      await assert.rejects(bandcampApi.getReleaseAsync('https://example.bandcamp.com/album/x'), (e) => {
        assert.match(e.message, /^No element matching \[data-tralbum\] on page "Something else"$/)
        return true
      })
    } finally {
      global.fetch = original
      resetRateLimit()
      resetReleaseIndex()
    }
  },
})
