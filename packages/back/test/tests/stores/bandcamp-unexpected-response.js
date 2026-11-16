const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')

const bandcampApi = require('../../../routes/stores/bandcamp/bandcamp-api.js')
const { resetRateLimit, resetReleaseIndex, isRateLimited } = bandcampApi.static

const CHALLENGE_PAGE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'fixtures', 'bandcamp', 'bandcamp-client-challenge.html'),
  'utf8',
)
const htmlResponse = (html) =>
  new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

// Runs fn with fetch answering every request with the page, and counts the requests that reach it.
const withPage = async (html, fn) => {
  const original = global.fetch
  let requests = 0
  global.fetch = async () => {
    requests++
    return htmlResponse(html)
  }
  resetRateLimit()
  try {
    await fn(() => requests)
  } finally {
    global.fetch = original
    resetRateLimit()
  }
}

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

  'a search answered with the challenge page pauses Bandcamp requests': () =>
    withPage(CHALLENGE_PAGE, async () => {
      await assert.rejects(bandcampApi.getSearchResultsAsync('noisia'), (e) => {
        assert.strictEqual(e.isRateLimit, true)
        assert.strictEqual(e.isChallenge, true)
        return true
      })
      assert.strictEqual(isRateLimited(), true)
    }),

  'a search while requests are paused does not reach Bandcamp': () =>
    withPage(CHALLENGE_PAGE, async (requestCount) => {
      await bandcampApi.getArtistAsync('https://noisia.bandcamp.com').catch(() => {})
      await assert.rejects(bandcampApi.getSearchResultsAsync('noisia'), (e) => e.isSuspended === true)
      assert.strictEqual(requestCount(), 1)
    }),
})
